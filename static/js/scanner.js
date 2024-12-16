// Variabili globali
let scannerActive = false;
let lastResult = null;
let lastTime = new Date().getTime();
let scanCount = {};
let scanMode = 'ISBN';
let currentBookISBN = null;
let qrScanner = null;
const MIN_SUCCESSFUL_SCANS = 1;
const SCAN_TIMEOUT = 2000;

// Funzioni di utilità
function isValidISBN(isbn) {
    isbn = isbn.replace(/[-\s]/g, '');
    if (isbn.length !== 10 && isbn.length !== 13) {
        return false;
    }
    return isbn.match(/^(?:\d{9}[\dX]|\d{13})$/);
}

// Funzione per listare le fotocamere disponibili
async function listCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(device => device.kind === 'videoinput');
        console.log('Fotocamere disponibili:', cameras);
        return cameras;
    } catch (err) {
        console.error('Errore nel listare le fotocamere:', err);
        return [];
    }
}

// Funzione per controllare i permessi della fotocamera
async function checkCameraPermissions() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment",
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 }
            } 
        });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err) {
        console.error('Errore permessi fotocamera:', err);
        showMessage('Per favore consenti l\'accesso alla fotocamera per utilizzare lo scanner.', true);
        return false;
    }
}

// Funzione principale di inizializzazione scanner
async function initScanner() {
    try {
        const hasPermission = await checkCameraPermissions();
        if (!hasPermission) {
            throw new Error('Permessi fotocamera non concessi');
        }

        const constraints = {
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector("#interactive"),
                constraints: {
                    facingMode: "environment",
                    aspectRatio: { min: 1, max: 2 },
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 }
                },
                area: {
                    top: "0%",
                    right: "0%",
                    left: "0%",
                    bottom: "0%"
                },
                singleChannel: false
            },
            decoder: {
                readers: [
                    "ean_reader",
                    "ean_8_reader",
                    "code_128_reader",
                    "code_39_reader",
                    "upc_reader",
                    "upc_e_reader"
                ],
                debug: {
                    drawBoundingBox: true,
                    showFrequency: false,
                    drawScanline: true,
                    showPattern: false
                },
                multiple: false
            },
            locator: {
                patchSize: "medium",
                halfSample: false
            },
            numOfWorkers: 4,
            frequency: 20,
            locate: true
        };

        console.log('Inizializzazione Quagga con configurazione ottimizzata');

        Quagga.init(constraints, function(err) {
            if (err) {
                console.error('Errore Quagga.init:', err);
                showMessage('Errore nell\'avvio dello scanner: ' + err.message, true);
                return;
            }

            console.log("Quagga inizializzato con successo");
            setupVideoElement();
            setupScannerCallbacks();
            Quagga.start();
        });

    } catch (err) {
        console.error('Errore inizializzazione scanner:', err);
        showMessage('Errore inizializzazione: ' + err.message, true);
    }
}

function setupVideoElement() {
    const interactive = document.getElementById('interactive');
    const video = interactive.querySelector('video');
    
    if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        
        video.style.width = '100%';
        video.style.height = 'auto';
        video.style.maxHeight = '80vh';
        video.style.objectFit = 'cover';
        
        video.addEventListener('loadedmetadata', () => {
            console.log('Video metadata caricati:', {
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                aspectRatio: (video.videoWidth / video.videoHeight).toFixed(2)
            });
        });
    }
}

function setupScannerCallbacks() {
    Quagga.onProcessed(function(result) {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                drawingCtx.clearRect(0, 0, 
                    parseInt(drawingCanvas.getAttribute("width")),
                    parseInt(drawingCanvas.getAttribute("height"))
                );
                result.boxes.filter(function(box) {
                    return box !== result.box;
                }).forEach(function(box) {
                    Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 },
                        drawingCtx, { color: "green", lineWidth: 2 });
                });
            }

            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 },
                    drawingCtx, { color: "#00F", lineWidth: 2 });
            }

            if (result.codeResult && result.codeResult.code) {
                Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' },
                    drawingCtx, { color: 'red', lineWidth: 3 });
            }
        }
    });

    Quagga.onDetected(handleScan);
}

function handleScan(result) {
    let code = result.codeResult.code;
    let currentTime = new Date().getTime();
    
    if (scanMode === 'ISBN') {
        if (!isValidISBN(code)) {
            console.log('Codice non valido:', code);
            return;
        }

        if (!scanCount[code]) {
            scanCount[code] = {
                count: 1,
                lastSeen: currentTime
            };
        } else {
            if (currentTime - scanCount[code].lastSeen > SCAN_TIMEOUT) {
                scanCount[code].count = 1;
            } else {
                scanCount[code].count++;
            }
            scanCount[code].lastSeen = currentTime;
        }

        if (scanCount[code].count >= MIN_SUCCESSFUL_SCANS && 
            code !== lastResult && 
            currentTime - lastTime > SCAN_TIMEOUT) {
            processISBN(code, currentTime);
        }
    }
}

function showMessage(message, isError = false) {
    const messageDiv = document.getElementById('success-message');
    if (!messageDiv) return;

    messageDiv.textContent = message;
    messageDiv.style.display = 'block';
    messageDiv.className = `message-banner ${isError ? 'error-message' : 'success-message'}`;
    
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '20px';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translateX(-50%)';
    messageDiv.style.zIndex = '1000';
    messageDiv.style.width = '90%';
    messageDiv.style.maxWidth = '400px';
    messageDiv.style.padding = '15px';
    messageDiv.style.borderRadius = '8px';
    messageDiv.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    
    messageDiv.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

// Gestione dell'interfaccia utente
async function toggleScanner() {
    const container = document.getElementById('scanner-container');
    const button = document.querySelector('.control-button');
    
    if (!scannerActive) {
        try {
            const hasPermission = await checkCameraPermissions();
            if (!hasPermission) {
                console.error('Permessi fotocamera non concessi');
                return;
            }

            container.style.display = 'block';
            button.innerHTML = '<i class="fas fa-stop"></i> Stop Scanner';
            document.body.classList.add('scanner-active');
            
            await initScanner();
            scannerActive = true;
        } catch (err) {
            console.error('Errore nell\'avvio dello scanner:', err);
            showMessage('Errore nell\'avvio dello scanner: ' + err.message, true);
        }
    } else {
        stopScanner();
        button.innerHTML = '<i class="fas fa-camera"></i> Avvia Scanner';
        document.body.classList.remove('scanner-active');
        scannerActive = false;
    }
}

function stopScanner() {
    try {
        const container = document.getElementById('scanner-container');
        container.style.display = 'none';
        if (Quagga) {
            Quagga.stop();
        }
        scannerActive = false;
        document.querySelector('.control-button').innerHTML = 
            '<i class="fas fa-camera"></i> Avvia Scanner';
    } catch (err) {
        console.error('Errore nello stop dello scanner:', err);
    }
}
// Funzioni di gestione dei libri e processing
function processISBN(code, currentTime) {
    lastResult = code;
    lastTime = currentTime;
    
    updateScanStatus(`Scansione ISBN: ${code}`);
    
    fetch('/process_isbn', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({isbn: code})
    })
    .then(response => response.json())
    .then(handleBookData)
    .catch(handleError);
}

function updateScanStatus(message, isLoading = true) {
    const resultElement = document.getElementById('result');
    if (resultElement) {
        resultElement.innerHTML = `
            <div class="status-indicator ${isLoading ? 'scanning' : ''}">
                ${isLoading ? '<i class="fas fa-spinner fa-spin"></i>' : ''}
                <span>${message}</span>
            </div>
        `;
    }
}

function updateBookInfo(bookInfo) {
    const bookInfoDiv = document.querySelector('.book-info');
    if (!bookInfoDiv) return;

    bookInfoDiv.innerHTML = `
        <div class="book-info-content">
            <h3>${bookInfo.title}</h3>
            <p><strong>Autore:</strong> ${bookInfo.author}</p>
            <p><strong>Data pubblicazione:</strong> ${bookInfo.publish_date || 'Non disponibile'}</p>
            <p><strong>Generi:</strong> ${bookInfo.genres || 'Non specificati'}</p>
        </div>
    `;
    bookInfoDiv.style.display = 'block';
}

function showLocationScanPrompt() {
    const bookInfoDiv = document.querySelector('.book-info');
    if (!bookInfoDiv) return;

    const promptHtml = `
        <div class="location-prompt">
            <p>Vuoi scansionare la posizione del libro?</p>
            <div class="location-buttons">
                <button onclick="startLocationScan()" class="scan-location-btn">
                    <i class="fas fa-qrcode"></i>
                    Scansiona QR Code Posizione
                </button>
                <button onclick="skipLocationScan()" class="skip-btn">
                    <i class="fas fa-times"></i>
                    Salta
                </button>
            </div>
        </div>
    `;

    // Aggiungi il prompt mantenendo le informazioni del libro
    bookInfoDiv.innerHTML += promptHtml;
}

function handleBookData(data) {
    if (data.book_info && data.book_info.title !== 'Book not found') {
        currentBookISBN = data.isbn; // Assicurati che sia impostato qui
        stopScanner();
        showMessage(`Libro trovato: ${data.book_info.title}`);
        updateBookInfo(data.book_info);
        showLocationScanPrompt();
    } else {
        showMessage('Libro non trovato nel database. Riprova.', true);
        currentBookISBN = null; // Reset se il libro non viene trovato
    }
}


function handleError(error) {
    console.error('Errore:', error);
    showMessage('Errore durante la processazione del libro. Riprova.', true);
    updateScanStatus('Errore. Riprova.', false);
}

// Gestione scansione posizione
function startLocationScan() {
    scanMode = 'LOCATION';
    stopScanner();
    
    const qrReader = document.getElementById('qr-reader');
    if (!qrReader) return;
    
    qrReader.style.display = 'block';
    
    if (!qrScanner) {
        qrScanner = new Html5Qrcode("qr-reader");
    }
    
    const qrConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
    };
    
    qrScanner.start(
        { facingMode: "environment" },
        qrConfig,
        onQRCodeSuccess,
        onQRCodeError
    ).catch((err) => {
        console.error("Errore scanner QR:", err);
        showMessage('Errore nell\'avvio dello scanner QR', true);
    });
}

function onQRCodeSuccess(decodedText) {
    if (decodedText.startsWith('LOC:')) {
        const location = decodedText.substring(4);
        handleLocationScan(location);
        stopQrScanner();
    }
}

function onQRCodeError(error) {
    // Gestione silenziosa degli errori non critici
    if (error !== 'QR code parse error') {
        console.log('QR scan error:', error);
    }
}

function skipLocationScan() {
    scanMode = 'ISBN';
    currentBookISBN = null;
    refreshLibrary();
    resetScannerInterface();
}

function handleLocationScan(location) {
    if (!currentBookISBN) {
        showMessage('Errore: seleziona prima un libro scansionando il codice ISBN.', true);
        return;
    }

    updateLocation(currentBookISBN, location);
}


function updateLocation(isbn, location) {
    showMessage('Aggiornamento posizione...', false);
    
    fetch(`/update_location/${isbn}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location: location })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showMessage(`Posizione aggiornata: ${location}`);
            completeLocationUpdate();
        } else {
            throw new Error(data.message || 'Errore aggiornamento posizione');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showMessage('Errore nell\'aggiornamento della posizione', true);
    });
}

function completeLocationUpdate() {
    stopQrScanner();
    document.getElementById('qr-reader').style.display = 'none';
    scanMode = 'ISBN';
    currentBookISBN = null;
    refreshLibrary();
    resetScannerInterface();
}

function stopQrScanner() {
    if (qrScanner && qrScanner._isScanning) {
        qrScanner.stop().then(() => {
            console.log('QR Scanner stopped');
        }).catch(err => {
            console.error('Error stopping QR scanner:', err);
        });
    }
}

function resetScannerInterface() {
    const bookInfoDiv = document.querySelector('.book-info');
    if (bookInfoDiv) bookInfoDiv.innerHTML = '';
    
    const resultElement = document.getElementById('result');
    if (resultElement) resultElement.textContent = 'Scanner pronto';
    
    const qrReader = document.getElementById('qr-reader');
    if (qrReader) qrReader.style.display = 'none';
    
    const scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) scannerContainer.style.display = 'none';
    
    stopScanner();
    stopQrScanner();
}

function refreshLibrary() {
    fetch('/books')
        .then(response => response.json())
        .then(updateLibraryTable)
        .catch(error => {
            console.error('Error:', error);
            showMessage('Errore nel caricamento della libreria', true);
        });
}

function updateLibraryTable(books) {
    const content = document.querySelector('.table-container');
    if (!content) return;
    
    if (books.length === 0) {
        content.innerHTML = '<p class="text-center">Nessun libro presente</p>';
        return;
    }
    
    content.innerHTML = `
        <table class="results-table">
            <thead>
                <tr>
                    <th>Titolo</th>
                    <th>Autore</th>
                    <th>Generi</th>
                    <th>Posizione</th>
                </tr>
            </thead>
            <tbody>
                ${books.map(book => `
                    <tr>
                        <td>${book.title}</td>
                        <td>${book.author}</td>
                        <td>${book.genres || 'N/A'}</td>
                        <td>${book.location || 'Non specificata'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    refreshLibrary();
    
    // Gestione orientamento per dispositivi mobili
    window.addEventListener('orientationchange', function() {
        if (scannerActive) {
            stopScanner();
            setTimeout(() => {
                if (scannerActive) {
                    initScanner();
                }
            }, 1000);
        }
    });
    
    // Gestione della visibilità della pagina
    document.addEventListener('visibilitychange', function() {
        if (document.hidden && scannerActive) {
            stopScanner();
        }
    });
});