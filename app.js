document.addEventListener('DOMContentLoaded', ()F => {

    // --- STATE MANAGEMENT ---
    let currentState = {
        productId: null,
        productName: null,
        currentPhase: null, // 'decision', 'info', 'form', 'summary', 'success'
        currentInfoStep: 1,
        currentFormStep: 1,
        formData: {
            name: '',
            phone: '',
            city: '',
            address: '',
            note: ''
        }
    };
    let audioPlayer = new Audio();
    const sessionId = 'a5m-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    // --- DOM SELECTORS ---
    const overlay = document.getElementById('assistant-overlay');
    const overlayBody = document.getElementById('overlay-body');
    const closeButton = document.getElementById('close-overlay');
    const productGrid = document.getElementById('product-grid');

    // --- CONSTANTS (DARIJA CONTENT) ---
    const INFO_STEPS = [
        { key: 'info_what', title: 'شنو هو هاد المنتج؟', text: 'شرح مبسط وعملي للمنتج وكيفاش كيخدم...' },
        { key: 'info_benefits', title: 'شنو غادي نستافد؟', text: 'النتائج الحقيقية لي غادي تلاحظها في حياتك اليومية...' },
        { key:... 'info_who', title: 'لمن هاد البرنامج؟', text: 'واش هادشي ليك؟ ولمن ماكيصلاحش...' },
        { key: 'info_how', title: 'كيفاش غادي نخدمو؟', text: 'المراحل خطوة بخطوة من بعد ما تسجل...' },
        { key: 'info_price', title: 'الثمن وطرق الدفع', text: 'شرح ديال الثمن والاختيارات المتاحة...' }
    ];

    const FORM_STEPS = [
        { key: 'form_name', label: 'الاسم الكامل', placeholder: 'مثال: فاطمة الزهراء العلوي', hint: 'كتب الاسم ديالك كامل باش نتواصلو معاك.', type: 'text', required: true },
        { key: 'form_phone', label: 'رقم الهاتف (واتساب)', placeholder: '06xxxxxxxx', hint: 'ضروري باش نتاصلو بيك ونتبعو معاك فالواتساب.', type: 'tel', required: true },
        { key: 'form_city', label: 'المدينة', placeholder: 'مثال: الدار البيضاء، مراكش...', hint: 'باش نعرفو فين غادي نصيفطو ليك الطلبية.', type: 'text', required: true },
        { key: 'form_address', label: 'العنوان (اختياري)', placeholder: 'الحي، الشارع، رقم الدار...', hint: 'إلا بغيتي التوصيل حتى للدار. ممكن تخليه خاوي.', type: 'text', required: false },
        { key: 'form_note', label: 'شي ملاحظة؟ (اختياري)', placeholder: 'مثال: عندي حساسية من...', hint: 'أي حاجة بغيتينا نعرفوها قبل ما نتواصلو معاك.', type: 'textarea', required: false }
    ];

    // --- EVENT LISTENERS ---
    
    // 1. Open Overlay
    productGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) return;
        
        // Find the actual button if the click was on the card
        const button = e.target.closest('[data-action="open-overlay"]');
        if (button || e.target.classList.contains('product-card')) {
            openOverlay(card);
        }
    });

    // 2. Close Overlay
    closeButton.addEventListener('click', closeOverlay);

    // 3. Dynamic Overlay Actions (Event Delegation)
    overlayBody.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        
        switch (action) {
            case 'navigate-phase':
                renderPhase(actionTarget.dataset.phase);
                break;
            case 'navigate-info':
                renderInfoStep(parseInt(actionTarget.dataset.step));
                break;
            case 'navigate-form':
                handleFormNavigation(actionTarget.dataset.direction);
                break;
            case 'play-audio':
                playCurrentAudio();
                break;
            case 'submit-order':
                submitOrder();
                break;
            case 'edit-form':
                // Reset form to first step but keep data
                renderPhase('form');
                break;
        }
    });
    
    // Listen for form input to save data
    overlayBody.addEventListener('input', (e) => {
        const input = e.target.closest('input, textarea');
        if(input && input.name) {
            currentState.formData[input.name] = input.value;
        }
    });

    // --- CORE FUNCTIONS ---

    function openOverlay(cardElement) {
        // Reset state
        currentState.productId = cardElement.dataset.productId;
        currentState.productName = cardElement.dataset.productName;
        currentState.currentInfoStep = 1;
        currentState.currentFormStep = 1;
        // Reset form data for new session
        currentState.formData = { name: '', phone: '', city: '', address: '', note: '' };

        trackEvent('product_click', { productId: currentState.productId });
        
        renderPhase('decision');
        overlay.classList.remove('overlay-hidden');
        overlay.classList.add('overlay-shown');
    }

    function closeOverlay() {
        overlay.classList.remove('overlay-shown');
        overlay.classList.add('overlay-hidden');
        audioPlayer.pause();
        overlayBody.innerHTML = ''; // Clean up
    }

    /**
     * Main render function for switching between major phases.
     * @param {string} phaseName - 'decision', 'info', 'form', 'summary', 'success'
     */
    function renderPhase(phaseName) {
        currentState.currentPhase = phaseName;
        trackEvent('phase_change', { to: phaseName });

        let html = '';
        switch (phaseName) {
            case 'decision':
                html = getDecisionPhaseHTML();
                break;
            case 'info':
                // 'info' phase is special, it calls its own renderer
                renderInfoStep(1); // Start at step 1
                return; // Exit renderPhase
            case 'form':
                html = getFormPhaseHTML();
                break;
            case 'summary':
                html = getSummaryPhaseHTML();
                break;
            case 'success':
                html = getSuccessPhaseHTML();
                break;
        }
        
        overlayBody.innerHTML = html;

        // Special handling for form phase to show the first step
        if (phaseName === 'form') {
            updateFormStepView();
        }

        playCurrentAudio();
    }
    
    // --- HTML GENERATORS ---

    function getAudioPlayerHTML() {
        return `
            <div class="audio-player">
                <div class="audio-wave">
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                </div>
                <button class="btn-play-audio" data-action="play-audio">عاود سمع الشرح</button>
            </div>
        `;
    }
    
    function getBreadcrumbs(activePhase) {
        const phases = ['decision', 'info', 'form', 'summary'];
        const names = ['الاختيار', 'المعلومات', 'التسجيل', 'التأكيد'];
        
        return `
            <div class="step-breadcrumbs">
                ${phases.map((p, i) => `<span class="${p === activePhase ? 'active' : ''}">${names[i]}</span>`).join('&larr;')}
            </div>
        `;
    }

    function getDecisionPhaseHTML() {
        return `
            ${getBreadcrumbs('decision')}
            <h3>${currentState.productName}</h3>
            ${getAudioPlayerHTML()}
            <div class="choice-buttons">
                <button class="btn-primary" data-action="navigate-phase" data-phase="form">بغيت نشري دابا</button>
                <button class="btn-secondary" data-action="navigate-phase" data-phase="info">بغيت نعرف كثر</button>
            </div>
        `;
    }

    /**
     * Renders a specific info step directly into the overlay body.
     * @param {number} stepIndex - 1 to 5
     */
    function renderInfoStep(stepIndex) {
        currentState.currentPhase = 'info'; // Ensure phase is set
        currentState.currentInfoStep = stepIndex;
        
        const step = INFO_STEPS[stepIndex - 1];
        if (!step) return; // Should not happen

        trackEvent('info_step_view', { stepKey: step.key, stepIndex: stepIndex });
        
        let nextButtonHTML = '';
        if (stepIndex < INFO_STEPS.length) {
            nextButtonHTML = `<button class="btn-secondary" data-action="navigate-info" data-step="${stepIndex + 1}">الخطوة التالية</button>`;
        } else {
            nextButtonHTML = `<button class="btn-secondary" data-action="navigate-phase" data-phase="form">سالينا، ندوزو للطلبية</button>`;
        }

        overlayBody.innerHTML = `
            ${getBreadcrumbs('info')}
            <h3>${step.title}</h3>
            ${getAudioPlayerHTML()}
            <p style="text-align: center; margin-bottom: 25px;">${step.text}</p>
            <div class="choice-buttons">
                <button class="btn-primary" data-action="navigate-phase" data-phase="form">شري دابا</button>
                ${nextButtonHTML}
            </div>
        `;
        playCurrentAudio();
    }
    
    function getFormPhaseHTML() {
        currentState.currentFormStep = 1; // Always start form at step 1
        
        const formFieldsHTML = FORM_STEPS.map((step, index) => {
            const stepNum = index + 1;
            const inputId = `form_field_${step.key}`;
            const value = currentState.formData[step.key.replace('form_', '')] || '';
            
            let inputHTML = '';
            if (step.type === 'textarea') {
                inputHTML = `<textarea id="${inputId}" name="${step.key.replace('form_', '')}" placeholder="${step.placeholder}">${value}</textarea>`;
            } else {
                inputHTML = `<input type="${step.type}" id="${inputId}" name="${step.key.replace('form_', '')}" placeholder="${step.placeholder}" value="${value}">`;
            }

            return `
                <div class="form-step" data-step="${stepNum}">
                    <div class="form-field">
                        <label for="${inputId}">${step.label} ${step.required ? '*' : ''}</label>
                        ${inputHTML}
                        <p class="hint">${step.hint}</p>
                    </div>
                </div>
            `;
        }).join('');
    
        return `
            ${getBreadcrumbs('form')}
            <h3>معلومات الطلبية</h3>
            ${getAudioPlayerHTML()}
            <form id="a5masi-form">
                ${formFieldsHTML}
            </form>
            <div class="form-navigation">
                <button class="btn-secondary" data-action="navigate-form" data-direction="prev">السابق</button>
                <button class="btn-primary" data-action="navigate-form" data-direction="next">التالي</button>
                <button class="btn-primary" data-action="navigate-phase" data-phase="summary" style="display: none;">تأكيد المعلومات</button>
            </div>
        `;
    }

    function handleFormNavigation(direction) {
        const currentStep = currentState.currentFormStep;
        
        // --- Validation ---
        if (direction === 'next') {
            const stepConfig = FORM_STEPS[currentStep - 1];
            const inputName = stepConfig.key.replace('form_', '');
            const value = currentState.formData[inputName];
            
            if (stepConfig.required && (!value || value.trim() === '')) {
                trackEvent('form_validation_error', { field: inputName });
                // Simple validation: alert or add red border
                const inputEl = overlayBody.querySelector(`[name="${inputName}"]`);
                inputEl.style.borderColor = 'red';
                setTimeout(() => { inputEl.style.borderColor = var(--glass-border); }, 2000);
                return; // Stop navigation
            }
            trackEvent('field_completed', { field: inputName });
        }

        // --- Navigation ---
        let nextStep = currentStep;
        if (direction === 'next' && currentStep < FORM_STEPS.length) {
            nextStep++;
        } else if (direction === 'prev' && currentStep > 1) {
            nextStep--;
        }

        currentState.currentFormStep = nextStep;
        updateFormStepView();
        playCurrentAudio();
    }
    
    function updateFormStepView() {
        const currentStep = currentState.currentFormStep;
        
        // Show/Hide form steps
        overlayBody.querySelectorAll('.form-step').forEach(stepEl => {
            stepEl.classList.remove('active');
            if (parseInt(stepEl.dataset.step) === currentStep) {
                stepEl.classList.add('active');
            }
        });
        
        // Update navigation buttons
        const prevBtn = overlayBody.querySelector('[data-action="navigate-form"][data-direction="prev"]');
        const nextBtn = overlayBody.querySelector('[data-action="navigate-form"][data-direction="next"]');
        const submitBtn = overlayBody.querySelector('[data-action="navigate-phase"][data-phase="summary"]');
        
        prevBtn.style.display = (currentStep === 1) ? 'none' : 'inline-block';
        nextBtn.style.display = (currentStep === FORM_STEPS.length) ? 'none' : 'inline-block';
        submitBtn.style.display = (currentStep === FORM_STEPS.length) ? 'inline-block' : 'none';
    }

    function getSummaryPhaseHTML() {
        const { name, phone, city, address, note } = currentState.formData;
        
        return `
            ${getBreadcrumbs('summary')}
            <h3>ملخص الطلبية</h3>
            ${getAudioPlayerHTML()}
            
            <ul class="summary-list">
                <li><strong>المنتج:</strong> <span>${currentState.productName}</span></li>
                <li><strong>الاسم:</strong> <span>${name}</span></li>
                <li><strong>الهاتف:</strong> <span>${phone}</span></li>
                <li><strong>المدينة:</strong> <span>${city}</span></li>
                <li><strong>العنوان:</strong> <span>${address || 'لم يتم إدخاله'}</span></li>
                <li><strong>ملاحظة:</strong> <span>${note || 'لا توجد'}</span></li>
            </ul>

            <h3 style="font-size: 1.2rem; text-align: right; margin-top: 30px;">عروض إضافية</h3>
            <div class="upsell-item glass-panel">
                <p>مكالمة متابعة إضافية (30 دقيقة)</p>
                <button class="btn-primary">أضف (+150 درهم)</button>
            </div>
            <div class="upsell-item glass-panel">
                <p>ملخص البرنامج (PDF) قابل للطباعة</p>
                <button class="btn-primary">أضف (+50 درهم)</button>
            </div>

            <div class="choice-buttons" style="margin-top: 30px;">
                <button class="btn-primary" data-action="submit-order">أكد الطلبية النهائية</button>
                <button class="btn-secondary" data-action="edit-form">رجع نعدل المعلومات</button>
            </div>
        `;
    }
    
    function getSuccessPhaseHTML() {
        return `
            <h3 style="color: var(--neon-cyan);">شكراً لك!</h3>
            <p style="text-align: center; font-size: 1.1rem;">الطلبية ديالك تسجلات بنجاح.</p>
            <p style="text-align: center;">غادي يتواصل معاك واحد من الفريق ديالنا على الواتساب في أقرب وقت باش يأكد معاك كلشي.</p>
        `;
    }


    // --- AUDIO CONTROLLER ---

    function playCurrentAudio() {
        const path = getAudioPath();
        if (path) {
            audioPlayer.src = path;
            audioPlayer.play().catch(e => console.warn("Audio play interrupted:", e));
            trackEvent('audio_play', { path });
        }
    }

    function getAudioPath() {
        const { productId, currentPhase, currentInfoStep, currentFormStep } = currentState;
        let stepKey = '';

        if (currentPhase === 'decision') stepKey = 'intro';
        if (currentPhase === 'info') stepKey = INFO_STEPS[currentInfoStep - 1]?.key;
        if (currentPhase === 'form') stepKey = FORM_STEPS[currentFormStep - 1]?.key;
        if (currentPhase === 'summary') stepKey = 'summary';

        if (!productId || !stepKey) return null;
        
        // Placeholder path as files don't exist yet
        const path = `assets/audio/${productId}/${stepKey}.mp3`;
        console.log("Audio Path:", path); // For debugging
        return path;
    }

    // --- BACKEND & ANALYTICS (SIMULATED) ---

    function trackEvent(eventType, eventData = {}) {
        const payload = {
            sessionId: sessionId,
            productId: currentState.productId,
            eventType: eventType,
            eventData: eventData,
            timestamp: new Date().toISOString()
        };
        
        console.log('TRACK EVENT:', payload);
        
        // LATER:
        // fetch('/api/event', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(payload)
        // }).catch(err => console.error('Event tracking failed:', err));
    }

    function submitOrder() {
        const payload = {
            sessionId: sessionId,
            productId: currentState.productId,
            productName: currentState.productName,
            formData: currentState.formData,
            clientMeta: {
                userAgent: navigator.userAgent,
                language: navigator.language
            },
            timeline: {
                // This is a simplified timeline. A real one would collect all visited steps.
                phasesVisited: ['decision', currentState.currentInfoStep > 1 ? 'info' : null, 'form', 'summary'].filter(Boolean),
                infoStepsSeen: currentState.currentInfoStep
            },
            createdAt: new Date().toISOString()
        };
        
        console.log('SUBMIT ORDER:', JSON.stringify(payload, null, 2));
        
        trackEvent('order_confirmed', { productId: currentState.productId });

        // LATER:
        // fetch('/api/order', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(payload)
        // })
        // .then(response => response.json())
        // .then(data => {
        //     if(data.status === 'ok') {
        //         renderPhase('success');
        //     } else {
        //         alert('حدث خطأ، المرجو المحاولة مرة أخرى.');
        //     }
        // })
        // .catch(err => {
        //     console.error('Order submission failed:', err);
        //     alert('حدث خطأ، المرجو المحاولة مرة أخرى.');
        // });
        
        // Simulate success for now
        renderPhase('success');
    }

});