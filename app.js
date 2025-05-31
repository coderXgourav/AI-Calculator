    const videoElement = document.getElementById('video');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const expressionElement = document.getElementById('expression');
    const resultElement = document.getElementById('result');
    const errorMessageElement = document.getElementById('error-message');
    const operatorButtons = document.querySelectorAll('.operator-btn');
    const fingerCountElement = document.getElementById('finger-count');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const loadingSpinner = document.getElementById('loading-spinner');
    const cameraSelect = document.getElementById('camera-select');

    let expression = '';
    let lastGestureTime = 0;
    let lastOperatorTime = 0;
    const numberDebounceDelay = 1000;
    const operatorDebounceDelay = 500;
    let lastFingerCount = 0;
    let isHandDown = true;
    let currentHoveredButton = null;
    let isInOperatorArea = false;
    let currentFingerCount = 0;
    let camera = null;
    let selectedCameraId = null;

    // Initialize MediaPipe Hands
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    hands.onResults((results) => {
      canvasElement.width = canvasElement.offsetWidth;
      canvasElement.height = canvasElement.offsetHeight;
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        drawHand(landmarks);

        const fingertip = landmarks[8];
        const x = fingertip.x * canvasElement.width;
        const y = fingertip.y * canvasElement.height;

        const operatorAreaHeight = 80;
        
        if (y <= operatorAreaHeight) {
          isInOperatorArea = true;
          updateStatus('operator-mode', 'Operator Mode - Point at buttons');
          handleOperatorInteraction(x, y);
          isHandDown = true;
          lastFingerCount = 0;
        } else {
          isInOperatorArea = false;
          const fingerCount = countFingers(landmarks);
          currentFingerCount = fingerCount;
          fingerCountElement.textContent = fingerCount;
          updateStatus('detecting', `Detecting ${fingerCount} finger${fingerCount !== 1 ? 's' : ''}`);
          handleNumberInput(fingerCount);
          resetOperatorHighlight();
        }
      } else {
        currentFingerCount = 0;
        fingerCountElement.textContent = '0';
        isHandDown = true;
        lastFingerCount = 0;
        isInOperatorArea = false;
        updateStatus('ready', 'Ready - Show fingers to input numbers');
        resetOperatorHighlight();
      }
    });

    function updateStatus(type, text) {
      statusIndicator.className = type;
      statusText.textContent = text;
    }

    function drawHand(landmarks) {
      const gradient = canvasCtx.createLinearGradient(0, 0, canvasElement.width, canvasElement.height);
      gradient.addColorStop(0, '#07272c');
      gradient.addColorStop(1, '#07272c');

      canvasCtx.strokeStyle = gradient;
      canvasCtx.lineWidth = 4;
      canvasCtx.fillStyle = 'red';
      canvasCtx.shadowColor = '#4299e1';
      canvasCtx.shadowBlur = 6;
      
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17]
      ];
      
      canvasCtx.beginPath();
      for (const [start, end] of connections) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        canvasCtx.moveTo(startPoint.x * canvasElement.width, startPoint.y * canvasElement.height);
        canvasCtx.lineTo(endPoint.x * canvasElement.width, endPoint.y * canvasElement.height);
      }
      canvasCtx.stroke();
      
      landmarks.forEach((landmark, index) => {
        if ([4, 8, 12, 16, 20].includes(index)) {
          canvasCtx.beginPath();
          canvasCtx.arc(
            landmark.x * canvasElement.width, 
            landmark.y * canvasElement.height, 
            6, 0, 2 * Math.PI
          );
          canvasCtx.fill();
        }
      });

      canvasCtx.shadowBlur = 0;
    }

    function countFingers(landmarks) {
      const fingerTips = [8, 12, 16, 20];
      const fingerPips = [6, 10, 14, 18];
      let count = 0;
      
      for (let i = 0; i < fingerTips.length; i++) {
        const tip = landmarks[fingerTips[i]];
        const pip = landmarks[fingerPips[i]];
        if (tip.y < pip.y) {
          count++;
        }
      }
      
      const thumbTip = landmarks[4];
      const thumbMcp = landmarks[3];
      if (thumbTip.x > thumbMcp.x) {
        count++;
      }
      
      return Math.max(1, Math.min(count, 9));
    }

    function handleNumberInput(fingerCount) {
      const currentTime = Date.now();
      
      if (fingerCount > 0 && isHandDown && currentTime - lastGestureTime > numberDebounceDelay) {
        if (fingerCount !== lastFingerCount) {
          addNumberToExpression(fingerCount);
          lastGestureTime = currentTime;
          lastFingerCount = fingerCount;
          isHandDown = false;
        }
      } else if (fingerCount === 0) {
        isHandDown = true;
        lastFingerCount = 0;
      }
    }

    function addNumberToExpression(num) {
      if (expression === '' || expression === 'Ready to calculate...') {
        expression = num.toString();
      } else {
        const trimmed = expression.trim();
        const lastChar = trimmed.slice(-1);
        
        if (/[0-9]/.test(lastChar)) {
          expression = trimmed + num.toString();
        } else if (/[+\-×÷]/.test(lastChar)) {
          expression = trimmed + ' ' + num.toString();
        } else {
          expression = trimmed + num.toString();
        }
      }
      
      expressionElement.textContent = expression;
      clearResult();
      clearError();
    }

    function handleOperatorInteraction(x, y) {
      const currentTime = Date.now();
      let foundButton = null;

      operatorButtons.forEach(button => {
        const rect = button.getBoundingClientRect();
        const containerRect = document.getElementById('video-container').getBoundingClientRect();
        
        const buttonX = rect.left - containerRect.left;
        const buttonY = rect.top - containerRect.top;
        const buttonWidth = rect.width;
        const buttonHeight = rect.height;

        if (x >= buttonX && x <= buttonX + buttonWidth && 
            y >= buttonY && y <= buttonY + buttonHeight) {
          foundButton = button;
        }
      });

      if (foundButton !== currentHoveredButton) {
        if (currentHoveredButton) {
          currentHoveredButton.classList.remove('highlighted');
        }
        
        if (foundButton) {
          foundButton.classList.add('highlighted');
          currentHoveredButton = foundButton;
        } else {
          currentHoveredButton = null;
        }
      }

      if (foundButton && currentTime - lastOperatorTime > operatorDebounceDelay) {
        handleOperatorAction(foundButton.textContent, foundButton.id);
        lastOperatorTime = currentTime;
      }
    }

    function resetOperatorHighlight() {
      if (currentHoveredButton) {
        currentHoveredButton.classList.remove('highlighted');
        currentHoveredButton = null;
      }
    }

    function handleOperatorAction(operator, buttonId) {
      const trimmed = expression.trim();
      
      if (operator === 'C') {
        expression = 'Ready to calculate...';
        expressionElement.textContent = expression;
        resultElement.textContent = '';
        clearError();
        return;
      }

      if (operator === '=') {
        if (trimmed === '' || trimmed === 'Ready to calculate...') {
          showError('No expression to calculate');
          return;
        }
        
        if (/[+\-×÷]$/.test(trimmed)) {
          showError('Expression cannot end with an operator');
          return;
        }
        
        try {
          const result = evaluateExpression(trimmed);
          resultElement.textContent = result.toString();
          expression = 'Ready to calculate...';
          expressionElement.textContent = expression;
          clearError();
        } catch (e) {
          showError('Invalid expression: ' + e.message);
        }
        return;
      }

      if (trimmed === '' || trimmed === 'Ready to calculate...') {
        showError('Enter a number first');
        return;
      }

      if (/[+\-×÷]$/.test(trimmed)) {
        expression = trimmed.slice(0, -1) + operator;
      } else {
        expression = trimmed + ' ' + operator;
      }
      
      expressionElement.textContent = expression;
      clearResult();
      clearError();
    }

    function evaluateExpression(expr) {
      try {
        let jsExpr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        
        if (!/^[0-9+\-*/()\s]+$/.test(jsExpr)) {
          throw new Error('Invalid characters in expression');
        }
        
        if (/\/\s*0(?!\d)/.test(jsExpr)) {
          throw new Error('Division by zero');
        }
        
        const result = Function(`"use strict"; return (${jsExpr})`)();
        
        if (!isFinite(result)) {
          throw new Error('Result is not a finite number');
        }
        
        return Math.round(result * 1000000) / 1000000;
      } catch (e) {
        throw new Error(e.message || 'Calculation error');
      }
    }

    function showError(message) {
      errorMessageElement.textContent = message;
      errorMessageElement.style.display = 'block';
      setTimeout(() => {
        clearError();
      }, 3000);
    }

    function clearError() {
      errorMessageElement.style.display = 'none';
    }

    function clearResult() {
      resultElement.textContent = '';
    }

    async function populateCameraSelect() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '<option value="">Select Camera</option>';
        videoDevices.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.text = device.label || `Camera ${index + 1}`;
          cameraSelect.appendChild(option);
        });

        if (videoDevices.length > 0) {
          selectedCameraId = videoDevices[0].deviceId;
          cameraSelect.value = selectedCameraId;
          initializeCamera();
        } else {
          showError('No cameras found. Please connect a camera.');
          loadingSpinner.style.display = 'none';
        }
      } catch (error) {
        console.error('Error enumerating devices:', error);
        showError('Failed to list cameras. Please check permissions.');
        loadingSpinner.style.display = 'none';
      }
    }

    async function switchCamera() {
      selectedCameraId = cameraSelect.value;
      if (camera) {
        await camera.stop();
      }
      if (selectedCameraId) {
        initializeCamera();
      }
    }

    async function initializeCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support webcam access.');
        loadingSpinner.style.display = 'none';
        return;
      }

      try {
        const constraints = {
          video: {
            width: 640,
            height: 480,
            deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        camera = new Camera(videoElement, {
          onFrame: async () => {
            await hands.send({ image: videoElement });
          },
          width: 640,
          height: 480
        });

        videoElement.srcObject = stream;
        await camera.start();
        loadingSpinner.style.display = 'none';
        clearError();
      } catch (error) {
        console.error('Camera initialization error:', error);
        loadingSpinner.style.display = 'none';
        let errorMsg = 'Failed to access webcam. ';

        switch(error.name) {
          case 'NotAllowedError':
            errorMsg += 'Please allow webcam access and refresh the page.';
            break;
          case 'NotFoundError':
            errorMsg += 'No webcam found. Please connect a webcam.';
            break;
          case 'NotReadableError':
            errorMsg += 'Webcam is being used by another application.';
            break;
          default:
            errorMsg += 'Please check your camera settings.';
        }

        showError(errorMsg);
      }
    }

    // Initialize the application
    populateCameraSelect();