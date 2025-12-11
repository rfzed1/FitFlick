document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        const icon = mobileMenuBtn.querySelector('i');
        if (mobileMenu.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });

    // Close mobile menu when a link is clicked
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        });
    });

    // Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // FAQ Accordion
    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isOpen = question.classList.contains('active');

            // Close all other answers
            faqQuestions.forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.classList.remove('active');
                q.nextElementSibling.style.maxHeight = null;
            });

            // Toggle current answer
            if (!isOpen) {
                question.classList.add('active');
                answer.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    // Modal Logic
    const modal = document.getElementById('tryoutModal');
    const openModalBtns = document.querySelectorAll('.open-modal-btn');
    const closeModalBtn = document.getElementById('closeModal');
    const closeResultBtn = document.getElementById('closeResultBtn');
    const unlockBtn = document.getElementById('unlockBtn');

    // Steps
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const loadingState = document.getElementById('loadingState');
    const simulationForm = document.getElementById('simulationForm');

    // Forms
    const signupForm = document.getElementById('signupForm');

    // Email validation helper
    function isValidEmail(email) {
        if (!email) return false;
        const parts = email.split("@");
        if (parts.length !== 2) return false;
        const [local, domain] = parts;
        if (!local || !domain) return false;
        if (domain.indexOf(".") === -1) return false;
        if (email.startsWith(".") || email.endsWith(".") || email.startsWith("@") || email.endsWith("@")) {
            return false;
        }
        return true;
    }

    // Utility functions for future use (login area)
    function getCurrentUser() {
        const userStr = localStorage.getItem("fitflick_user");
        return userStr ? JSON.parse(userStr) : null;
    }

    function getAuthToken() {
        return localStorage.getItem("fitflick_token");
    }

    function openModal() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
        resetModal();
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Enable scrolling
    }

    function resetModal() {
        step1.classList.add('active');
        step2.classList.remove('active');
        step3.classList.remove('active');
        loadingState.style.display = 'none';
        simulationForm.style.display = 'block';
        signupForm.reset();
        simulationForm.reset();
    }

    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default anchor behavior if it's a link
            openModal();
        });
    });

    closeModalBtn.addEventListener('click', closeModal);
    closeResultBtn.addEventListener('click', closeModal);

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Step 1: Real Registration
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const signupNameInput = document.getElementById('signupName');
        const signupEmailInput = document.getElementById('signupEmail');
        const signupPhoneInput = document.getElementById('signupPhone');
        const signupPasswordInput = document.getElementById('signupPassword');
        const signupError = document.getElementById('signupError');

        const name = signupNameInput.value.trim();
        const email = signupEmailInput.value.trim();
        const phone = signupPhoneInput.value.trim();
        const password = signupPasswordInput.value;

        // Clear previous error
        if (signupError) {
            signupError.style.display = 'none';
            signupError.textContent = '';
        }

        // Validations
        if (!name || !email || !phone || !password) {
            if (signupError) {
                signupError.textContent = "Preencha todos os campos para continuar.";
                signupError.style.display = 'block';
            }
            return;
        }

        if (!isValidEmail(email)) {
            if (signupError) {
                signupError.textContent = "Por favor, informe um e-mail válido.";
                signupError.style.display = 'block';
            }
            return;
        }

        if (password.length < 6) {
            if (signupError) {
                signupError.textContent = "A senha deve ter pelo menos 6 caracteres.";
                signupError.style.display = 'block';
            }
            return;
        }

        // Phone validation
        const numericPhone = phone.replace(/\D/g, "");
        if (numericPhone.length < 8) {
            if (signupError) {
                signupError.textContent = "Informe um número de celular válido.";
                signupError.style.display = 'block';
            }
            return;
        }

        // Call backend registration
        try {
            const response = await fetch("http://localhost:3000/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, email, phone, password }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                const message = data.error || "Erro ao criar sua conta. Tente novamente.";
                if (signupError) {
                    signupError.textContent = message;
                    signupError.style.display = 'block';
                }
                return;
            }

            // Save token and user to localStorage
            if (data.token) {
                localStorage.setItem("fitflick_token", data.token);
            }
            if (data.user) {
                localStorage.setItem("fitflick_user", JSON.stringify(data.user));
            }

            console.log("✅ Usuário registrado com sucesso:", data.user);

            // Proceed to Step 2 (upload)
            step1.classList.remove('active');
            step2.classList.add('active');

        } catch (err) {
            console.error("Erro em signupForm:", err);
            if (signupError) {
                signupError.textContent = "Erro de comunicação com o servidor. Verifique se o backend está rodando.";
                signupError.style.display = 'block';
            }
        }
    });

    // Step 2 -> Loading -> Step 3
    simulationForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userImageInput = document.getElementById('userPhotoInput');
        const clothesImageInput = document.getElementById('clothingPrintInput');
        const pieceTypeSelect = document.getElementById('pieceTypeSelect');
        const resultImg = document.getElementById('resultImage');

        // Validate files
        if (!userImageInput.files[0] || !clothesImageInput.files[0]) {
            alert("Envie a foto da pessoa e o print da roupa para continuar.");
            return;
        }

        // Show loading state
        simulationForm.style.display = 'none';
        loadingState.style.display = 'block';

        try {
            // Prepare FormData
            const formData = new FormData();
            formData.append("userImage", userImageInput.files[0]);
            formData.append("clothesImage", clothesImageInput.files[0]);
            formData.append("pieceType", pieceTypeSelect.value);

            // Call backend API
            const response = await fetch("http://localhost:3000/api/generate-look", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!data.success) {
                alert(data.error || "Erro ao gerar look com a IA.");
                loadingState.style.display = 'none';
                simulationForm.style.display = 'block';
                return;
            }

            // Display the result
            resultImg.src = `data:${data.mimeType};base64,${data.imageBase64}`;
            resultImg.style.display = 'block';

            // Move to step 3
            loadingState.style.display = 'none';
            step2.classList.remove('active');
            step3.classList.add('active');

        } catch (error) {
            console.error("Erro na comunicação com o servidor:", error);
            alert("Erro na comunicação com o servidor. Verifique se o backend está rodando em http://localhost:3000");
            loadingState.style.display = 'none';
            simulationForm.style.display = 'block';
        }
    });

    // Unlock button (go to pricing)
    unlockBtn.addEventListener('click', (e) => {
        closeModal();
        // Smooth scroll is handled by the generic anchor listener
    });

    // --- NEW: Scroll Animations ---
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.fade-up, .fade-in, .slide-in-right, .scale-in');
    animatedElements.forEach(el => observer.observe(el));

    // --- NEW: Background Particles Animation ---
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = Math.random() * 0.5 - 0.25;
            this.speedY = Math.random() * 0.5 - 0.25;
            this.color = `rgba(139, 92, 255, ${Math.random() * 0.2 + 0.1})`; // Primary color with low opacity
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x > canvas.width) this.x = 0;
            if (this.x < 0) this.x = canvas.width;
            if (this.y > canvas.height) this.y = 0;
            if (this.y < 0) this.y = canvas.height;
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        const particleCount = Math.min(window.innerWidth / 10, 100); // Responsive count
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
        requestAnimationFrame(animateParticles);
    }

    initParticles();
    animateParticles();

    // --- NEW: File Upload Preview ---
    function handleFileSelect(inputId, previewId, uploadContainerId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        const uploadContainer = document.getElementById(uploadContainerId);
        const img = preview.querySelector('img');

        input.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    img.src = e.target.result;
                    preview.classList.add('active');
                    uploadContainer.style.display = 'none'; // Hide upload box
                }
                reader.readAsDataURL(file);
            }
        });

        // Allow re-uploading by clicking the preview
        preview.addEventListener('click', () => {
            input.click();
        });
    }

    handleFileSelect('userPhotoInput', 'userPhotoPreview', 'userPhotoUpload');
    handleFileSelect('clothingPrintInput', 'clothingPrintPreview', 'clothingPrintUpload');

});
