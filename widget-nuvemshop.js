/**
 * Quantic Materialize Widget for Nuvemshop
 * This script adds a "Materialize" button to product pages, allowing customers to 
 * see the product on themselves using AI.
 */

(function () {
    // 1. Configuration & Selectors
    const CONFIG = {
        webhookUrl: 'https://n8n.segredosdodrop.com/webhook/quantic-materialize',
        buttonLabel: 'Materializar com IA',
        modalTitle: 'Quantic Materialize',
        modalSubtitle: 'Veja este produto em você instantaneamente usando IA.',
        primaryColor: '#8b5cf6',
        secondaryColor: '#d946ef',
        // Common Nuvemshop selectors
        productImageSelector: '.js-product-image, .product-image, #product-image, [data-main-image]',
        addToCartSelector: '.js-addtocart, .js-product-buy-btn, [name="add"]',
    };

    // 2. Load External Resources (Fonts & Icons)
    function loadResources() {
        const links = [
            'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
            'https://unpkg.com/@phosphor-icons/web'
        ];
        links.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            document.head.appendChild(link);
        });
    }

    // 3. Inject Styles
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --quantic-purple: #8b5cf6;
                --quantic-pink: #d946ef;
                --quantic-bg: #0f0f1e;
                --quantic-card: rgba(255, 255, 255, 0.05);
                --quantic-text: #ffffff;
                --quantic-text-gray: #9ca3af;
            }

            .quantic-btn-materialize {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background: linear-gradient(135deg, var(--quantic-purple) 0%, #6d28d9 100%);
                color: white !important;
                border: none;
                padding: 14px 24px;
                font-family: 'Outfit', sans-serif;
                font-size: 16px;
                font-weight: 700;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
                box-shadow: 0 10px 20px rgba(139, 92, 246, 0.2);
                margin: 10px 0;
                width: 100%;
                text-decoration: none;
            }

            .quantic-btn-materialize:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 30px rgba(139, 92, 246, 0.3);
                background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
            }

            .quantic-btn-materialize i {
                font-size: 20px;
            }

            /* Modal Styles */
            #quantic-modal-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                z-index: 999999;
                align-items: center;
                justify-content: center;
                font-family: 'Outfit', sans-serif;
            }

            .quantic-modal-content {
                background: var(--quantic-bg);
                width: 90%;
                max-width: 500px;
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 24px;
                padding: 32px;
                position: relative;
                color: white;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                animation: quanticFadeIn 0.4s ease-out;
            }

            @keyframes quanticFadeIn {
                from { opacity: 0; transform: scale(0.95) translateY(20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }

            .quantic-modal-close {
                position: absolute;
                top: 20px;
                right: 20px;
                background: none;
                border: none;
                color: var(--quantic-text-gray);
                cursor: pointer;
                font-size: 24px;
                transition: color 0.3s;
            }

            .quantic-modal-close:hover {
                color: white;
            }

            .quantic-modal-header {
                text-align: center;
                margin-bottom: 24px;
            }

            .quantic-modal-title {
                font-size: 24px;
                font-weight: 800;
                margin: 0 0 8px 0;
                background: linear-gradient(135deg, #fff 0%, var(--quantic-purple) 100%);
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
            }

            .quantic-modal-subtitle {
                font-size: 14px;
                color: var(--quantic-text-gray);
                margin: 0;
            }

            .quantic-upload-area {
                border: 2px dashed rgba(139, 92, 246, 0.3);
                border-radius: 16px;
                padding: 40px 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s;
                background: rgba(139, 92, 246, 0.02);
                position: relative;
            }

            .quantic-upload-area:hover {
                border-color: var(--quantic-purple);
                background: rgba(139, 92, 246, 0.05);
            }

            .quantic-upload-area i {
                font-size: 40px;
                color: var(--quantic-purple);
                margin-bottom: 12px;
            }

            .quantic-upload-input {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: 0;
                cursor: pointer;
            }

            .quantic-preview-container {
                display: none;
                margin-top: 20px;
                border-radius: 12px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .quantic-preview-img {
                width: 100%;
                height: auto;
                display: block;
            }

            /* Loader */
            .quantic-loader {
                display: none;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                margin-top: 20px;
            }

            .quantic-loader-text {
                font-weight: 700;
                background: linear-gradient(135deg, var(--quantic-purple), var(--quantic-pink));
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
                animation: quanticPulse 1.5s infinite;
            }

            @keyframes quanticPulse {
                0%, 100% { opacity: 0.7; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
            }

            .quantic-loader-bar {
                width: 100%;
                height: 4px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 10px;
                overflow: hidden;
                position: relative;
            }

            .quantic-loader-bar::after {
                content: '';
                position: absolute;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, var(--quantic-purple), transparent);
                animation: quanticSlide 1.5s infinite linear;
            }

            @keyframes quanticSlide {
                0% { left: -100%; }
                100% { left: 100%; }
            }

            .quantic-result-container {
                display: none;
                flex-direction: column;
                gap: 16px;
                margin-top: 20px;
            }

            .quantic-result-img {
                width: 100%;
                border-radius: 12px;
                border: 1px solid var(--quantic-purple);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            }

            .quantic-btn-generate {
                background: var(--quantic-purple);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 10px;
                font-weight: 700;
                width: 100%;
                margin-top: 20px;
                cursor: pointer;
                transition: opacity 0.3s;
            }

            .quantic-btn-generate:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .quantic-error {
                color: #ef4444;
                font-size: 12px;
                margin-top: 10px;
                text-align: center;
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    // 4. Dom Creation
    function createModal() {
        const modalHtml = `
            <div id="quantic-modal-overlay">
                <div class="quantic-modal-content">
                    <button class="quantic-modal-close" id="quantic-close-btn"><i class="ph ph-x"></i></button>
                    
                    <div class="quantic-modal-header" id="quantic-header">
                        <h2 class="quantic-modal-title">${CONFIG.modalTitle}</h2>
                        <p class="quantic-modal-subtitle">${CONFIG.modalSubtitle}</p>
                    </div>

                    <div id="quantic-upload-step">
                        <div class="quantic-upload-area">
                            <i class="ph ph-user-focus"></i>
                            <p>Toque para tirar ou subir uma foto sua</p>
                            <input type="file" class="quantic-upload-input" id="quantic-file-input" accept="image/*">
                        </div>
                        <div class="quantic-preview-container" id="quantic-preview-box">
                            <img src="" class="quantic-preview-img" id="quantic-preview-img">
                        </div>
                        <button class="quantic-btn-generate" id="quantic-generate-btn" disabled>Materializar agora</button>
                    </div>

                    <div class="quantic-loader" id="quantic-loader">
                        <div class="quantic-loader-text">Gerando Prova Quântica</div>
                        <div class="quantic-loader-bar"></div>
                    </div>

                    <div class="quantic-result-container" id="quantic-result-box">
                        <img src="" class="quantic-result-img" id="quantic-result-img">
                        <button class="quantic-btn-materialize" id="quantic-download-btn">
                            <i class="ph ph-download-simple"></i> Baixar Imagem
                        </button>
                    </div>

                    <div class="quantic-error" id="quantic-error-msg">Ocorreu um erro. Tente novamente.</div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // 5. Main Logic
    async function init() {
        loadResources();
        injectStyles();
        createModal();

        const waitInterval = setInterval(() => {
            const addToCart = document.querySelector(CONFIG.addToCartSelector);
            if (addToCart && !document.querySelector('.quantic-btn-materialize')) {
                // clearInterval(waitInterval); // keep watching in case of SPA nav
                const btn = document.createElement('button');
                btn.className = 'quantic-btn-materialize';
                btn.type = 'button';
                btn.innerHTML = `<i class="ph-fill ph-magic-wand"></i> ${CONFIG.buttonLabel}`;

                // Inject after "Add to cart" or in a specific location
                addToCart.parentNode.insertBefore(btn, addToCart.nextSibling);

                btn.onclick = () => {
                    document.getElementById('quantic-modal-overlay').style.display = 'flex';
                };
            }
        }, 1000);

        // UI Handles
        const fileInput = document.getElementById('quantic-file-input');
        const generateBtn = document.getElementById('quantic-generate-btn');
        const closeBtn = document.getElementById('quantic-close-btn');
        const overlay = document.getElementById('quantic-modal-overlay');
        const statusMsg = document.getElementById('quantic-error-msg');

        let personFile = null;

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                personFile = file;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    document.getElementById('quantic-preview-img').src = ev.target.result;
                    document.getElementById('quantic-preview-box').style.display = 'block';
                    generateBtn.disabled = false;
                };
                reader.readAsDataURL(file);
            }
        };

        closeBtn.onclick = () => {
            overlay.style.display = 'none';
            resetModal();
        };

        generateBtn.onclick = async () => {
            const productImg = document.querySelector(CONFIG.productImageSelector);
            if (!productImg) {
                alert('Imagem do produto não encontrada.');
                return;
            }

            // Show Loader
            document.getElementById('quantic-upload-step').style.display = 'none';
            document.getElementById('quantic-loader').style.display = 'flex';
            statusMsg.style.display = 'none';

            try {
                const formData = new FormData();
                formData.append('person_image', personFile);

                // Get product image URL (many Nuvemshop themes use src or data-src)
                const productUrl = productImg.src || productImg.getAttribute('data-src') || productImg.getAttribute('srcset')?.split(' ')[0];

                // Fetch the product image as a blob to send to n8n
                const pResp = await fetch(productUrl);
                const pBlob = await pResp.blob();
                formData.append('product_image', pBlob, 'product.png');

                const response = await fetch(CONFIG.webhookUrl, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    let imageUrl = '';
                    const contentType = response.headers.get('content-type');

                    if (contentType && contentType.includes('application/json')) {
                        let data = await response.json();
                        if (Array.isArray(data)) data = data[0];
                        imageUrl = data.url || data.image || data.imageUrl || data.output || data.result;
                    } else {
                        const blob = await response.blob();
                        if (blob.size > 200) imageUrl = URL.createObjectURL(blob);
                    }

                    if (imageUrl) {
                        document.getElementById('quantic-loader').style.display = 'none';
                        document.getElementById('quantic-result-img').src = imageUrl;
                        document.getElementById('quantic-result-box').style.display = 'flex';

                        document.getElementById('quantic-download-btn').onclick = () => {
                            const a = document.createElement('a');
                            a.href = imageUrl;
                            a.download = `quantic-result-${Date.now()}.png`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        };
                    } else {
                        throw new Error('No image returned');
                    }
                } else {
                    throw new Error('Server error');
                }
            } catch (err) {
                console.error(err);
                document.getElementById('quantic-loader').style.display = 'none';
                document.getElementById('quantic-upload-step').style.display = 'block';
                statusMsg.style.display = 'block';
            }
        };

        function resetModal() {
            document.getElementById('quantic-upload-step').style.display = 'block';
            document.getElementById('quantic-loader').style.display = 'none';
            document.getElementById('quantic-result-box').style.display = 'none';
            document.getElementById('quantic-preview-box').style.display = 'none';
            document.getElementById('quantic-file-input').value = '';
            generateBtn.disabled = true;
            statusMsg.style.display = 'none';
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
