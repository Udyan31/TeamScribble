document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- DOM Element Selection ---
    const mainCanvas = document.getElementById('main-canvas');
    const ctx = mainCanvas.getContext('2d');
    const cursorLayer = document.getElementById('cursor-layer');

    const nicknameDisplay = document.getElementById('user-nickname-display');
    const roomNameDisplay = document.getElementById('room-name-display');
    const participantsList = document.getElementById('participants-list');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat-btn');

    const toolButtons = document.querySelectorAll('.tool-btn');
    const pencilToolBtn = document.getElementById('pencil-tool');
    const eraserToolBtn = document.getElementById('eraser-tool');
    const shapeSquareToolBtn = document.getElementById('shape-square-tool');
    const shapeCircleToolBtn = document.getElementById('shape-circle-tool');
    const fillToolBtn = document.getElementById('fill-tool'); // New fill tool
    
    const brushSizeSlider = document.getElementById('brush-size-slider');
    const undoBtn = document.getElementById('undo-btn');
    const clearPageBtn = document.getElementById('clear-page-btn'); // Renamed from clearBoardBtn
    const colorPaletteContainer = document.getElementById('color-palette');

    const pageReviewContainer = document.getElementById('page-review-container');
    const pagePreviews = document.getElementById('page-previews');
    const addPageBtn = document.getElementById('add-page-btn');

    // --- State Management ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    const nickname = urlParams.get('nickname');

    // Display room info
    roomNameDisplay.textContent = `Room: ${roomId}`;
    nicknameDisplay.textContent = `You: ${nickname}`;

    let drawing = false;
    let currentStroke = []; // Stores individual points for current stroke/path
    let lastPos = { x: 0, y: 0 };
    let tool = 'pencil'; // 'pencil', 'eraser', 'square', 'circle', 'fill'
    let currentColor = '#000000';
    let currentBrushSize = 5;

    let pages = []; // Stores history of drawing actions for each page
    let activePageIndex = 0;
    let remoteUsers = {}; // { socketId: { nickname: '...', cursor: {x,y}, element: div } }

    const availableColors = [
        '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#FFFFFF',
        '#A37DF2', '#5D70F7', '#E84D7A', '#34C759', '#FF9500', '#5AC8FA', '#FF2D55', '#AF52DE', '#FF3B30'
    ]; // Expanded color palette

    // --- Canvas Setup & Resizing ---
    function resizeCanvas() {
        mainCanvas.width = mainCanvas.offsetWidth;
        mainCanvas.height = mainCanvas.offsetHeight;
        redrawActivePage();
        redrawAllPreviews();
    }
    window.addEventListener('resize', resizeCanvas);

    // --- Drawing Logic ---
    function getMousePos(e) {
        const rect = mainCanvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function drawAction(action, targetCtx = ctx) {
        // Handle 'fill' action type
        if (action.toolType === 'fill') {
            targetCtx.fillStyle = action.color;
            targetCtx.fillRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
            return; // Stop after filling
        }

        // Common stroke properties for other tools
        targetCtx.beginPath();
        targetCtx.strokeStyle = (action.toolType === 'eraser') ? '#FFFFFF' : action.color;
        targetCtx.lineWidth = action.size;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';

        // Draw based on tool type
        if (action.toolType === 'pencil' || action.toolType === 'eraser') {
            // Pencil/Eraser action contains an array of points for a single stroke
            if (action.points && action.points.length > 1) {
                targetCtx.moveTo(action.points[0].x, action.points[0].y);
                for (let i = 1; i < action.points.length; i++) {
                    targetCtx.lineTo(action.points[i].x, action.points[i].y);
                }
            }
        } else if (action.toolType === 'square') {
            targetCtx.rect(action.x0, action.y0, action.x1 - action.x0, action.y1 - action.y0);
        } else if (action.toolType === 'circle') {
            const radius = Math.sqrt(Math.pow(action.x1 - action.x0, 2) + Math.pow(action.y1 - action.y0, 2)) / 2;
            const centerX = action.x0 + (action.x1 - action.x0) / 2;
            const centerY = action.y0 + (action.y1 - action.y0) / 2;
            targetCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        }
        targetCtx.stroke();
    }

    function startDrawing(e) {
        if (e.target.id !== 'main-canvas') return;
        drawing = true;
        lastPos = getMousePos(e);
        currentStroke = [{ x: lastPos.x, y: lastPos.y }]; // Start collecting points
        
        // If it's a shape, immediately capture the start point
        if (tool === 'square' || tool === 'circle') {
             // For shapes, currentStroke[0] will be the origin
        } else if (tool === 'fill') {
            // Handle fill on mousedown, it's a single click action
            const fillAction = {
                toolType: 'fill',
                color: currentColor,
                timestamp: Date.now() // For potential future undo tracking by time
            };
            // Add the fill action to the beginning of the actions array
            pages[activePageIndex].drawingActions = pages[activePageIndex].drawingActions.filter(a => a.toolType !== 'fill'); // Remove previous fill
            pages[activePageIndex].drawingActions.unshift(fillAction);
            redrawActivePage(); // Redraw locally for instant feedback
            redrawCurrentPreview();
            socket.emit('drawingAction', { pageId: activePageIndex, action: fillAction });
            drawing = false; // Fill is a one-off action
        }
    }

    function stopDrawing() {
        if (!drawing) return;
        drawing = false;

        if (tool === 'pencil' || tool === 'eraser') {
            if (currentStroke.length > 1) { // Only save if more than one point was drawn
                const action = {
                    toolType: tool,
                    points: currentStroke, // Store all points for the stroke
                    color: currentColor,
                    size: currentBrushSize
                };
                pages[activePageIndex].drawingActions.push(action);
                socket.emit('drawingAction', { pageId: activePageIndex, action });
                redrawCurrentPreview();
            }
        } else if (tool === 'square' || tool === 'circle') {
            if (currentStroke.length > 0) { // Ensure at least a start point exists
                const startPoint = currentStroke[0];
                const endPoint = lastPos; // lastPos holds the final mouse position
                const action = {
                    x0: startPoint.x, y0: startPoint.y,
                    x1: endPoint.x, y1: endPoint.y,
                    color: currentColor, size: currentBrushSize, toolType: tool
                };
                pages[activePageIndex].drawingActions.push(action);
                socket.emit('drawingAction', { pageId: activePageIndex, action });
                redrawCurrentPreview();
            }
        }
        currentStroke = []; // Clear current stroke points
    }

    function drawOnMove(e) {
        if (e.target.id === 'main-canvas') {
            const pos = getMousePos(e);
            socket.emit('cursorMove', { x: pos.x, y: pos.y });
        }
        
        if (!drawing || tool === 'fill') return; // Fill is handled on mousedown

        const currentPos = getMousePos(e);

        if (tool === 'pencil' || tool === 'eraser') {
            currentStroke.push({ x: currentPos.x, y: currentPos.y });
            // Draw segment by segment for smooth local rendering
            const actionSegment = {
                toolType: tool,
                points: [lastPos, currentPos], // Draw just this segment
                color: currentColor,
                size: currentBrushSize
            };
            drawAction(actionSegment);
            lastPos = currentPos;
        } else if (tool === 'square' || tool === 'circle') {
            // For shapes, only draw a temporary preview until mouseup
            redrawActivePage(); // Clear previous temporary shape
            const startPoint = currentStroke[0]; // The initial mousedown point
            const tempAction = {
                x0: startPoint.x, y0: startPoint.y,
                x1: currentPos.x, y1: currentPos.y,
                color: currentColor, size: currentBrushSize, toolType: tool
            };
            drawAction(tempAction);
            lastPos = currentPos; // Update lastPos for the next frame or mouseup
        }
    }

    // --- UI Rendering ---
    function renderUI() {
        renderColorPalette();
        renderPagePreviews();
        setupToolButtons();
        updateParticipantsList();
    }

    function renderColorPalette() {
        colorPaletteContainer.innerHTML = '';
        availableColors.forEach(c => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            if (c === currentColor) swatch.classList.add('active');
            swatch.style.backgroundColor = c;
            swatch.addEventListener('click', () => {
                currentColor = c;
                renderColorPalette(); // Re-render to update active state
            });
            colorPaletteContainer.appendChild(swatch);
        });
    }

    function renderPagePreviews() {
        pagePreviews.innerHTML = ''; // Clear existing previews

        // Add page preview items
        pages.forEach((page, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'page-preview-item';
            if (index === activePageIndex) previewItem.classList.add('active');
            
            const previewCanvas = document.createElement('canvas');
            previewCanvas.className = 'page-preview-canvas';
            previewCanvas.width = 60; // Smaller dimensions for preview
            previewCanvas.height = 34;
            previewItem.appendChild(previewCanvas);

            // Add delete button (only if more than one page exists)
            if (pages.length > 1) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-page-icon';
                deleteBtn.innerHTML = '&times;';
                deleteBtn.title = 'Delete Page';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation(); // Prevent page switch when clicking delete
                    if (confirm('Are you sure you want to delete this page?')) {
                        socket.emit('deletePage', { pageId: index });
                    }
                };
                previewItem.appendChild(deleteBtn);
            }
            
            previewItem.onclick = () => switchPage(index);
            pagePreviews.appendChild(previewItem);
        });
        
        redrawAllPreviews(); // Draw content onto preview canvases
    }

    function setupToolButtons() {
        toolButtons.forEach(btn => {
            btn.onclick = () => {
                // For fill tool, it's a one-shot action, not a continuous tool mode
                if (btn === fillToolBtn) {
                     // Handled in startDrawing for immediate feedback.
                     // The click event here might be redundant if startDrawing always fires.
                     // However, keeping it just in case if users click fast.
                    const fillAction = { toolType: 'fill', color: currentColor };
                    pages[activePageIndex].drawingActions = pages[activePageIndex].drawingActions.filter(a => a.toolType !== 'fill');
                    pages[activePageIndex].drawingActions.unshift(fillAction);
                    redrawActivePage();
                    redrawCurrentPreview();
                    socket.emit('drawingAction', { pageId: activePageIndex, action: fillAction });
                    return;
                }

                // For other tools, update active state
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (btn === pencilToolBtn) tool = 'pencil';
                else if (btn === eraserToolBtn) tool = 'eraser';
                else if (btn === shapeSquareToolBtn) tool = 'square';
                else if (btn === shapeCircleToolBtn) tool = 'circle';
            };
        });

        // Specific action buttons
        undoBtn.onclick = () => {
            if (pages[activePageIndex] && pages[activePageIndex].drawingActions.length > 0) {
                // Send undo event to server, which will broadcast the updated state
                socket.emit('undo', { pageId: activePageIndex });
            }
        };

        clearPageBtn.onclick = () => {
            if (confirm('Are you sure you want to clear this entire page? This cannot be undone.')) {
                socket.emit('clearPage', { pageId: activePageIndex });
            }
        };

        brushSizeSlider.oninput = (e) => {
            currentBrushSize = parseInt(e.target.value);
        };

        addPageBtn.onclick = () => socket.emit('addPage');
    }
    
    // --- Redrawing Logic ---
    function redrawActivePage() {
        // FIX: Explicitly fill with white first to ensure a pure white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        
        if (pages[activePageIndex]) {
            // Iterate and draw all actions for the current page
            pages[activePageIndex].drawingActions.forEach(action => drawAction(action));
        }
    }
    function redrawAllPreviews() { pages.forEach((p, i) => redrawPreviewByIndex(i)); }
    function redrawCurrentPreview() { redrawPreviewByIndex(activePageIndex); }
    function redrawPreviewByIndex(index) {
        const previewItem = pagePreviews.querySelectorAll('.page-preview-item')[index];
        if (!previewItem) return;

        const previewCanvas = previewItem.querySelector('.page-preview-canvas');
        const previewCtx = previewCanvas.getContext('2d');
        
        // FIX: Also fill preview canvas with white
        previewCtx.fillStyle = '#FFFFFF';
        previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        const scaleX = previewCanvas.width / mainCanvas.width;
        const scaleY = previewCanvas.height / mainCanvas.height;

        if (pages[index]) {
            pages[index].drawingActions.forEach(action => {
                const scaledAction = { ...action }; // Clone action to scale coordinates

                // Scale points for pencil/eraser
                if (action.toolType === 'pencil' || action.toolType === 'eraser') {
                    scaledAction.points = action.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
                } else if (action.toolType === 'square' || action.toolType === 'circle') {
                    // Scale coordinates for shapes
                    scaledAction.x0 = action.x0 * scaleX;
                    scaledAction.y0 = action.y0 * scaleY;
                    scaledAction.x1 = action.x1 * scaleX;
                    scaledAction.y1 = action.y1 * scaleY;
                }
                
                // Adjust brush size for preview (smaller)
                scaledAction.size = Math.max(0.5, action.size * Math.min(scaleX, scaleY) * 0.7);

                drawAction(scaledAction, previewCtx);
            });
        }
    }

    function switchPage(index) {
        if (index === activePageIndex) return;
        activePageIndex = index;
        renderPagePreviews(); // Re-render to update active state
        redrawActivePage(); // Redraw main canvas with new page content
    }

    // --- Participants List ---
    function updateParticipantsList() {
        participantsList.innerHTML = '';
        for (const id in remoteUsers) {
            const user = remoteUsers[id];
            if (id === socket.id) continue; // Skip self, will add separately if needed
            const item = document.createElement('div');
            item.className = 'participant-item';
            const avatar = document.createElement('div');
            avatar.className = 'participant-avatar';
            avatar.textContent = user.nickname.charAt(0).toUpperCase();
            const nameSpan = document.createElement('span');
            nameSpan.textContent = user.nickname;
            item.appendChild(avatar);
            item.appendChild(nameSpan);
            participantsList.appendChild(item);
        }
    }

    // --- Chat Functions ---
    function addChatMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        const formattedNickname = (data.nickname === nickname) ? 'You' : data.nickname;
        messageDiv.innerHTML = `<strong>${formattedNickname}:</strong> <span>${data.message}</span>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to latest message
    }

    function sendChatMessage() {
        const message = chatInput.value.trim();
        if (message) {
            socket.emit('chatMessage', message);
            addChatMessage({ nickname: nickname, message: message }); // Add immediately for local user
            chatInput.value = '';
        }
    }
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // --- Live Cursors ---
    function updateCursorPosition(id, x, y) {
        let cursorDiv = remoteUsers[id]?.element;
        if (cursorDiv) {
            cursorDiv.style.left = `${x}px`;
            cursorDiv.style.top = `${y}px`;
        }
    }

    function addCursor(id, nickname, x, y) {
        if (id === socket.id || remoteUsers[id]?.element) return; // Don't add self cursor or duplicate

        const cursorDiv = document.createElement('div');
        cursorDiv.className = 'remote-cursor';
        cursorDiv.dataset.userId = id; // Store user ID for easy lookup
        cursorDiv.innerHTML = `
            <div class="cursor-pointer"></div>
            <div class="cursor-name">${nickname}</div>
        `;
        cursorDiv.style.left = `${x}px`;
        cursorDiv.style.top = `${y}px`;
        cursorLayer.appendChild(cursorDiv);
        remoteUsers[id].element = cursorDiv; // Store element reference
    }

    function removeCursor(id) {
        if (remoteUsers[id]?.element) {
            remoteUsers[id].element.remove();
            delete remoteUsers[id].element; // Clear element reference
        }
    }

    // --- Socket.IO Handlers ---
    socket.on('connect', () => {
        socket.emit('joinRoom', { roomId, nickname });
    });

    socket.on('joinError', (message) => {
        alert('Failed to join room: ' + message);
        window.location.href = '/'; // Redirect back to homepage on error
    });

    socket.on('roomState', (data) => {
        pages = data.pages;
        chatMessages.innerHTML = ''; // Clear chat before populating
        data.chat.forEach(msg => addChatMessage(msg)); // Populate chat history

        // Initialize/update remoteUsers based on current room state (excluding self)
        const oldRemoteUsers = { ...remoteUsers }; // Preserve old references
        remoteUsers = {}; // Reset remoteUsers

        for (const id in data.users) {
            if (id !== socket.id) {
                remoteUsers[id] = { ...data.users[id] };
                if (oldRemoteUsers[id] && oldRemoteUsers[id].element) {
                    remoteUsers[id].element = oldRemoteUsers[id].element; // Re-use existing cursor element
                } else {
                    addCursor(id, data.users[id].nickname, data.users[id].cursor.x, data.users[id].cursor.y);
                }
            }
        }
        // Remove cursors for users no longer in updated list
        for (const id in oldRemoteUsers) {
            if (!remoteUsers[id] && id !== socket.id) {
                removeCursor(id);
            }
        }

        updateParticipantsList();

        if (activePageIndex >= pages.length) activePageIndex = pages.length - 1;
        renderUI();
        resizeCanvas();
    });

    socket.on('drawingAction', (data) => {
        if (pages[data.pageId]) {
            // Apply fill actions correctly, replacing previous ones
            if (data.action.toolType === 'fill') {
                pages[data.pageId].drawingActions = pages[data.pageId].drawingActions.filter(a => a.toolType !== 'fill');
                pages[data.pageId].drawingActions.unshift(data.action);
            } else {
                pages[data.pageId].drawingActions.push(data.action);
            }

            if (data.pageId === activePageIndex) {
                // For a fill or other remote actions, redraw entire page to ensure perfect sync
                redrawActivePage(); 
            }
            redrawPreviewByIndex(data.pageId);
        }
    });

    socket.on('newChatMessage', (data) => {
        // Only add if not sent by current user (current user's message is added immediately)
        if (data.nickname !== nickname) {
            addChatMessage(data);
        }
    });

    socket.on('cursorUpdate', (data) => {
        if (remoteUsers[data.id]) {
            remoteUsers[data.id].cursor = { x: data.x, y: data.y };
            updateCursorPosition(data.id, data.x, data.y);
        }
    });

    socket.on('userJoined', (data) => {
        if (data.id !== socket.id) {
            remoteUsers[data.id] = { nickname: data.nickname, cursor: data.cursor };
            addCursor(data.id, data.nickname, data.cursor.x, data.cursor.y);
            updateParticipantsList();
            addChatMessage({ nickname: 'System', message: `${data.nickname} joined the room.` });
        }
    });

    socket.on('userLeft', (id) => {
        if (remoteUsers[id]) {
            addChatMessage({ nickname: 'System', message: `${remoteUsers[id].nickname} left the room.` });
            removeCursor(id);
            delete remoteUsers[id];
            updateParticipantsList();
        }
    });

    socket.on('updateUserList', (updatedUsers) => {
        // This is a robust way to sync participant list if any user joins/leaves
        const oldRemoteUsers = { ...remoteUsers }; // Capture current state for comparison
        remoteUsers = {}; // Reset

        for (const id in updatedUsers) {
            if (id !== socket.id) {
                remoteUsers[id] = { ...updatedUsers[id] };
                if (oldRemoteUsers[id] && oldRemoteUsers[id].element) {
                    remoteUsers[id].element = oldRemoteUsers[id].element; // Re-use existing cursor element
                } else {
                    addCursor(id, updatedUsers[id].nickname, updatedUsers[id].cursor.x, updatedUsers[id].cursor.y);
                }
            }
        }

        // Remove cursors for users no longer in the updated list
        for (const id in oldRemoteUsers) {
            if (!remoteUsers[id] && id !== socket.id) {
                removeCursor(id);
            }
        }
        updateParticipantsList();
    });

    // --- Initial Setup ---
    mainCanvas.addEventListener('mousedown', startDrawing);
    document.addEventListener('mouseup', stopDrawing);
    // document.addEventListener('mouseout', stopDrawing); // Removed to allow drawing to continue if mouse leaves canvas
    document.addEventListener('mousemove', drawOnMove);

    // Initial check for existing content
    if (pages.length === 0) {
        socket.emit('addPage'); // Ensure at least one page exists
    } else {
        renderUI();
        resizeCanvas();
    }
});