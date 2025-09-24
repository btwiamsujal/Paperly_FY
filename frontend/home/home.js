class HomeManager {
    constructor() {
        this.initAnimations();
        this.initInteractions();
        this.startCounterAnimation();
    }

    initAnimations() {
        // Add intersection observer for scroll animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animation = 'fadeInUp 0.8s ease-out forwards';
                }
            });
        }, observerOptions);

        // Observe elements for animation
        const elementsToAnimate = document.querySelectorAll('.feature-card, .stats-section');
        elementsToAnimate.forEach(el => observer.observe(el));
    }

    initInteractions() {
        // Add click handlers for feature cards
        const featureCards = document.querySelectorAll('.feature-card');
        featureCards.forEach(card => {
            card.addEventListener('click', (e) => {
                this.handleFeatureClick(e);
            });
        });

        // Add hover effects for CTA button
        const ctaButton = document.querySelector('.cta-button');
        if (ctaButton) {
            ctaButton.addEventListener('mouseenter', () => {
                this.animateButton(ctaButton);
            });
        }
    }

    handleFeatureClick(e) {
        const card = e.currentTarget;
        
        // Add click animation
        card.style.transform = 'translateY(-10px) scale(0.98)';
        
        setTimeout(() => {
            card.style.transform = 'translateY(-10px) scale(1)';
        }, 150);
    }

    animateButton(button) {
        // Create ripple effect
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.cssText = `
            position: absolute;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: scale(0);
            animation: ripple 0.6s linear;
            top: 50%;
            left: 50%;
            margin-top: -50px;
            margin-left: -50px;
        `;
        
        button.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    startCounterAnimation() {
        const counters = document.querySelectorAll('.stat-number');
        
        counters.forEach(counter => {
            const finalValue = parseInt(counter.textContent.replace(/,/g, ''));
            const duration = 2000; // 2 seconds
            const increment = finalValue / (duration / 16); // 60fps
            let currentValue = 0;
            
            const timer = setInterval(() => {
                currentValue += increment;
                if (currentValue >= finalValue) {
                    counter.textContent = finalValue.toLocaleString();
                    clearInterval(timer);
                } else {
                    counter.textContent = Math.floor(currentValue).toLocaleString();
                }
            }, 16);
        });
    }
}

// Add global styles for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .feature-card {
        animation: fadeInUp 0.8s ease-out;
        animation-fill-mode: both;
    }
    
    .feature-card:nth-child(1) { animation-delay: 0.1s; }
    .feature-card:nth-child(2) { animation-delay: 0.2s; }
    .feature-card:nth-child(3) { animation-delay: 0.3s; }
    .feature-card:nth-child(4) { animation-delay: 0.4s; }
`;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HomeManager();
});

// Add smooth scrolling for better UX
document.documentElement.style.scrollBehavior = 'smooth';