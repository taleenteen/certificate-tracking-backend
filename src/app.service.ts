import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getWelcomeHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-License API Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Outfit:wght@400;600&display=swap" rel="stylesheet">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            user-select: none;
        }
        body {
            background-color: #0c0b16;
            color: #ffffff;
            font-family: 'Outfit', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            overflow: hidden;
            position: relative;
        }
        /* Neon background grid */
        .grid-bg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(128, 90, 213, 0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(128, 90, 213, 0.05) 1px, transparent 1px);
            background-size: 40px 40px;
            background-position: center;
            z-index: 1;
        }
        .grid-bg::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, transparent 20%, #0c0b16 80%);
            z-index: 2;
        }
        /* Console container */
        .console-container {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            background: rgba(20, 18, 38, 0.7);
            border: 2px solid #3b2d54;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5),
                        0 0 15px 0 rgba(139, 92, 246, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            max-width: 500px;
            width: 90%;
            transition: transform 0.1s ease-out;
            transform-style: preserve-3d;
            perspective: 1000px;
        }
        .console-screen-wrapper {
            position: relative;
            width: 100%;
            aspect-ratio: 16/9;
            background-color: #121020;
            border-radius: 8px;
            overflow: hidden;
            border: 3px solid #ff4a7d;
            box-shadow: 0 0 20px rgba(255, 74, 125, 0.4),
                        inset 0 0 20px rgba(0, 0, 0, 0.8);
            margin-bottom: 20px;
            transform: translateZ(30px);
        }
        /* CRT scanline overlay */
        .scanlines {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(
                rgba(18, 16, 32, 0) 50%, 
                rgba(0, 0, 0, 0.25) 50%
            ), linear-gradient(
                90deg,
                rgba(255, 0, 0, 0.04),
                rgba(0, 255, 0, 0.02),
                rgba(0, 0, 255, 0.04)
            );
            background-size: 100% 4px, 6px 100%;
            z-index: 20;
            pointer-events: none;
            opacity: 0.85;
        }
        .crt-curve {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            box-shadow: inset 0 0 30px rgba(0,0,0,0.8);
            pointer-events: none;
            z-index: 21;
        }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            cursor: pointer;
        }
        /* Header Info */
        .header-title {
            font-family: 'Press Start 2P', monospace;
            font-size: 16px;
            color: #ff8ebb;
            text-shadow: 0 0 8px rgba(255, 142, 187, 0.6);
            margin-bottom: 6px;
            text-align: center;
            transform: translateZ(20px);
        }
        .header-subtitle {
            font-size: 13px;
            color: #a78bfa;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 600;
            transform: translateZ(10px);
        }
        /* Interactive controls card */
        .controls-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 12px;
            width: 100%;
            text-align: center;
            font-size: 12px;
            color: #93c5fd;
            margin-bottom: 20px;
            font-family: 'Press Start 2P', monospace;
            font-size: 8px;
            line-height: 1.6;
            transform: translateZ(15px);
        }
        /* Neon buttons */
        .button-group {
            display: flex;
            gap: 16px;
            width: 100%;
            transform: translateZ(25px);
        }
        .btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            transition: all 0.2s ease;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .btn-primary {
            background: linear-gradient(135deg, #ff4a7d, #ff8ebb);
            color: #0c0b16;
            box-shadow: 0 4px 14px rgba(255, 74, 125, 0.4);
            border: none;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 74, 125, 0.6);
        }
        .btn-secondary {
            background: transparent;
            border: 2px solid #8b5cf6;
            color: #c084fc;
            box-shadow: 0 4px 14px rgba(139, 92, 246, 0.1);
        }
        .btn-secondary:hover {
            background: rgba(139, 92, 246, 0.1);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(139, 92, 246, 0.3);
        }
        /* Version badge */
        .version-badge {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            color: #8b5cf6;
            font-weight: 600;
            letter-spacing: 1px;
            z-index: 10;
        }
    </style>
</head>
<body>
    <div class="grid-bg"></div>
    <div class="version-badge">API V1.0.0</div>
    
    <div class="console-container" id="console-box">
        <h1 class="header-title">E-LICENSE PLATFORM</h1>
        <div class="header-subtitle">Gateway Sandbox</div>
        
        <div class="console-screen-wrapper">
            <div class="scanlines"></div>
            <div class="crt-curve"></div>
            <canvas id="retro-canvas" width="400" height="225"></canvas>
        </div>
        
        <div class="controls-card">
            * MOVE CURSOR TO LOOK AROUND *<br>
            * CLICK & HOLD ON SCREEN TO INHALE *
        </div>
        
        <div class="button-group">
            <a href="/docs" class="btn btn-primary">Swagger Docs</a>
            <a href="/api/license-types" class="btn btn-secondary">API Probe</a>
        </div>
    </div>

    <script>
        const canvas = document.getElementById('retro-canvas');
        const ctx = canvas.getContext('2d');
        const consoleBox = document.getElementById('console-box');
        
        const WIDTH = 400;
        const HEIGHT = 225;
        
        let mouse = { x: WIDTH / 2, y: HEIGHT / 2, realX: 0, realY: 0 };
        let activeInhale = false;
        let time = 0;
        
        // Track mouse
        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.realX = e.clientX - rect.left;
            mouse.realY = e.clientY - rect.top;
            mouse.x = (mouse.realX / rect.width) * WIDTH;
            mouse.y = (mouse.realY / rect.height) * HEIGHT;
            
            // Console 3D tilt
            const screenCenterX = window.innerWidth / 2;
            const screenCenterY = window.innerHeight / 2;
            const tiltX = (e.clientX - screenCenterX) / screenCenterX * 15;
            const tiltY = (e.clientY - screenCenterY) / screenCenterY * -15;
            consoleBox.style.transform = 'rotateY(' + tiltX + 'deg) rotateX(' + tiltY + 'deg)';
        });
        
        // Keyboard and click support
        window.addEventListener('mousedown', () => { activeInhale = true; initAudio(); });
        window.addEventListener('mouseup', () => { activeInhale = false; });
        
        window.addEventListener('touchstart', (e) => {
            activeInhale = true;
            initAudio();
            const rect = canvas.getBoundingClientRect();
            const t = e.touches[0];
            mouse.x = ((t.clientX - rect.left) / rect.width) * WIDTH;
            mouse.y = ((t.clientY - rect.top) / rect.height) * HEIGHT;
        });
        window.addEventListener('touchend', () => { activeInhale = false; });
        
        // Synthesizer Audio
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }
        
        function playBleep(frequency, duration, type = 'sine', sweep = 0) {
            try {
                if (!audioCtx) return;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = type;
                osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
                if (sweep) {
                    osc.frequency.exponentialRampToValueAtTime(sweep, audioCtx.currentTime + duration);
                }
                
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.start();
                osc.stop(audioCtx.currentTime + duration);
            } catch(e) {}
        }
        
        let lastInhaleSoundTime = 0;
        function playInhaleSound() {
            const now = Date.now();
            if (now - lastInhaleSoundTime > 120) {
                playBleep(150, 0.12, 'triangle', 40);
                lastInhaleSoundTime = now;
            }
        }
        
        function playEatSound() {
            playBleep(220, 0.06, 'square');
        }
        
        function playSpitSound() {
            const notes = [261.63, 329.63, 392.00, 523.25];
            notes.forEach((freq, idx) => {
                setTimeout(() => {
                    playBleep(freq, 0.08, 'triangle');
                }, idx * 60);
            });
        }
        
        // Particles
        class StarParticle {
            constructor(x, y, vx, vy, color, size, type = 'star') {
                this.x = x;
                this.y = y;
                this.vx = vx;
                this.vy = vy;
                this.color = color;
                this.size = size;
                this.type = type; // star or wind
                this.life = 1;
                this.decay = Math.random() * 0.05 + 0.02;
            }
            update(kirby) {
                this.x += this.vx;
                this.y += this.vy;
                if (this.type === 'wind') {
                    // Pull wind lines into Kirby's mouth
                    const kx = kirby.x + 8;
                    const ky = kirby.y + 3;
                    const dx = kx - this.x;
                    const dy = ky - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 10) {
                        this.life = 0;
                    }
                } else {
                    this.life -= this.decay;
                }
            }
            draw() {
                if (this.life <= 0) return;
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.life;
                if (this.type === 'star') {
                    // Draw a little cross pixel star
                    ctx.fillRect(this.x, this.y, this.size, this.size);
                    ctx.fillRect(this.x - this.size, this.y, this.size, this.size);
                    ctx.fillRect(this.x + this.size, this.y, this.size, this.size);
                    ctx.fillRect(this.x, this.y - this.size, this.size, this.size);
                    ctx.fillRect(this.x, this.y + this.size, this.size, this.size);
                } else {
                    // Wind line
                    ctx.fillRect(this.x, this.y, this.size * 2, this.size / 2);
                }
                ctx.globalAlpha = 1.0;
            }
        }
        
        let particles = [];
        
        // Kirby
        class Kirby {
            constructor() {
                this.x = 80;
                this.y = 150;
                this.homeY = 150;
                this.radius = 16;
                this.targetRadius = 16;
                this.state = 'idle'; // idle, inhaling, fat, spit
                this.fatFrames = 0;
            }
            
            update() {
                this.radius += (this.targetRadius - this.radius) * 0.15;
                
                if (this.state === 'fat') {
                    this.targetRadius = 22;
                    this.fatFrames++;
                    if (this.fatFrames > 45) {
                        this.state = 'spit';
                        this.fatFrames = 0;
                        playSpitSound();
                        spitLetters();
                    }
                } else {
                    this.targetRadius = 16;
                }
                
                if (activeInhale && this.state !== 'fat') {
                    this.state = 'inhaling';
                    this.y = this.homeY - 10 + Math.sin(time * 0.1) * 3;
                    playInhaleSound();
                    
                    // Spawn wind particles
                    if (Math.random() < 0.35) {
                        const px = WIDTH + 10;
                        const py = Math.random() * 120 + 80;
                        const kx = this.x + 8;
                        const ky = this.y + 3;
                        const dx = kx - px;
                        const dy = ky - py;
                        const dist = Math.hypot(dx, dy);
                        const speed = Math.random() * 3 + 4;
                        particles.push(new StarParticle(
                            px, py, 
                            (dx / dist) * speed, (dy / dist) * speed, 
                            'rgba(255, 255, 255, 0.4)', 
                            Math.random() * 4 + 2, 
                            'wind'
                        ));
                    }
                } else if (this.state !== 'fat') {
                    this.state = 'idle';
                    this.y = this.homeY + Math.sin(time * 0.05) * 2;
                }
            }
            
            draw() {
                const kx = this.x;
                const ky = this.y;
                const kr = this.radius;
                
                // Draw feet (red)
                ctx.fillStyle = '#ff1e56';
                const footOffset = this.state === 'inhaling' ? Math.sin(time * 0.2) * 2 : 0;
                
                // Left foot
                ctx.beginPath();
                ctx.ellipse(kx - kr * 0.6, ky + kr * 0.7 + footOffset, kr * 0.5, kr * 0.3, 0.15, 0, Math.PI * 2);
                ctx.fill();
                
                // Right foot
                ctx.beginPath();
                ctx.ellipse(kx + kr * 0.4, ky + kr * 0.7 - footOffset, kr * 0.5, kr * 0.3, -0.15, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw body outline (darker pink)
                ctx.fillStyle = '#cc5c83';
                ctx.beginPath();
                ctx.arc(kx, ky, kr + 1, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw body (pink)
                ctx.fillStyle = '#ff8ebb';
                ctx.beginPath();
                ctx.arc(kx, ky, kr, 0, Math.PI * 2);
                ctx.fill();
                
                // Rosy cheeks
                ctx.fillStyle = '#ff4a7d';
                ctx.beginPath();
                ctx.arc(kx - kr * 0.45, ky + kr * 0.1, kr * 0.15, 0, Math.PI * 2);
                ctx.arc(kx + kr * 0.45, ky + kr * 0.1, kr * 0.15, 0, Math.PI * 2);
                ctx.fill();
                
                // Eye tracking
                const dx = mouse.x - kx;
                const dy = mouse.y - ky;
                const dist = Math.hypot(dx, dy) || 1;
                const ex = (dx / dist) * 1.5;
                const ey = (dy / dist) * 1.0;
                
                if (this.state === 'inhaling') {
                    // Straining / squinting eyes
                    ctx.strokeStyle = '#1e1e24';
                    ctx.lineWidth = 2;
                    ctx.lineCap = 'round';
                    // Left Eye
                    ctx.beginPath();
                    ctx.arc(kx - kr * 0.2 + ex, ky - kr * 0.15 + ey, 2.5, Math.PI, 0, false);
                    ctx.stroke();
                    // Right Eye
                    ctx.beginPath();
                    ctx.arc(kx + kr * 0.2 + ex, ky - kr * 0.15 + ey, 2.5, Math.PI, 0, false);
                    ctx.stroke();
                } else {
                    // Regular retro eyes
                    this.drawEye(kx - kr * 0.22 + ex, ky - kr * 0.15 + ey, kr);
                    this.drawEye(kx + kr * 0.22 + ex, ky - kr * 0.15 + ey, kr);
                }
                
                // Mouth
                if (this.state === 'inhaling') {
                    // Big open mouth
                    ctx.fillStyle = '#1c0f20';
                    ctx.beginPath();
                    ctx.arc(kx + kr * 0.15, ky + kr * 0.22, kr * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Tongue
                    ctx.fillStyle = '#ff4a7d';
                    ctx.beginPath();
                    ctx.arc(kx + kr * 0.2, ky + kr * 0.38, kr * 0.22, 0, Math.PI * 2);
                    ctx.fill();
                } else if (this.state === 'fat') {
                    // Tiny happy curved mouth
                    ctx.strokeStyle = '#1e1e24';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(kx, ky + kr * 0.15, 2.5, 0, Math.PI);
                    ctx.stroke();
                } else {
                    // Smile
                    ctx.strokeStyle = '#1e1e24';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(kx, ky + kr * 0.1, 2, 0, Math.PI);
                    ctx.stroke();
                }
                
                // Draw arms (pink)
                ctx.fillStyle = '#ff8ebb';
                if (this.state === 'inhaling') {
                    // Inhaling: Arms raised forward
                    ctx.beginPath();
                    ctx.ellipse(kx - kr * 0.8, ky - kr * 0.1, kr * 0.35, kr * 0.25, -0.4, 0, Math.PI * 2);
                    ctx.ellipse(kx + kr * 0.85, ky + kr * 0.05, kr * 0.35, kr * 0.25, 0.4, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Idle arms
                    ctx.beginPath();
                    ctx.ellipse(kx - kr * 0.85, ky + kr * 0.1, kr * 0.3, kr * 0.3, 0.1, 0, Math.PI * 2);
                    ctx.ellipse(kx + kr * 0.85, ky + kr * 0.1, kr * 0.3, kr * 0.3, -0.1, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            drawEye(x, y, kr) {
                const w = 2.5;
                const h = 6.5;
                // Oval
                ctx.fillStyle = '#1e1e24';
                ctx.beginPath();
                ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
                ctx.fill();
                // Blue bottom
                ctx.fillStyle = '#0066ff';
                ctx.beginPath();
                ctx.ellipse(x, y + h * 0.3, w * 0.8, h * 0.4, 0, 0, Math.PI * 2);
                ctx.fill();
                // White highlight
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(x, y - h * 0.4, w * 0.6, h * 0.3, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Letters
        class Letter {
            constructor(char, index) {
                this.char = char;
                this.index = index;
                this.homeX = 220 + index * 22;
                this.homeY = 150;
                this.x = this.homeX;
                this.y = this.homeY;
                this.vx = 0;
                this.vy = 0;
                this.scale = 1.0;
                this.angle = 0;
                this.eaten = false;
            }
            
            update(kirby) {
                if (this.eaten) {
                    this.scale += (0 - this.scale) * 0.2;
                    return;
                }
                
                if (kirby.state === 'inhaling') {
                    const kx = kirby.x + 8;
                    const ky = kirby.y + 4;
                    const dx = kx - this.x;
                    const dy = ky - this.y;
                    const dist = Math.hypot(dx, dy);
                    
                    if (dist < 18) {
                        this.eaten = true;
                        playEatSound();
                        
                        // Spawn eat sparks
                        for (let i = 0; i < 6; i++) {
                            particles.push(new StarParticle(
                                this.x, this.y, 
                                Math.random() * 4 - 2, Math.random() * 4 - 2, 
                                '#ff8ebb', 2
                            ));
                        }
                        
                        checkAllLettersEaten();
                    } else {
                        // Inhale suction gravity
                        const force = Math.max(0.05, (250 - dist) / 10);
                        this.vx += (dx / dist) * force * 0.35;
                        this.vy += (dy / dist) * force * 0.35;
                        
                        this.vx *= 0.85;
                        this.vy *= 0.85;
                        
                        this.x += this.vx;
                        this.y += this.vy;
                        
                        this.angle = this.vx * 0.06;
                        this.scale = Math.max(0.4, 1 - (220 - dist) / 250);
                    }
                } else {
                    // Spring physics back to home
                    const springK = 0.08;
                    const damping = 0.78;
                    
                    // Wave offset based on time and index for floating effect
                    const waveY = this.homeY + Math.sin(time * 0.08 + this.index * 0.5) * 3;
                    
                    const ax = (this.homeX - this.x) * springK;
                    const ay = (waveY - this.y) * springK;
                    
                    this.vx = (this.vx + ax) * damping;
                    this.vy = (this.vy + ay) * damping;
                    
                    this.x += this.vx;
                    this.y += this.vy;
                    
                    this.scale += (1.0 - this.scale) * 0.15;
                    this.angle += (0 - this.angle) * 0.1;
                }
            }
            
            draw() {
                if (this.scale <= 0.01) return;
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.scale(this.scale, this.scale);
                
                // Color shift based on position
                ctx.fillStyle = '#ff8ebb';
                ctx.shadowColor = '#ff4a7d';
                ctx.shadowBlur = 6;
                ctx.fillText(this.char, 0, 0);
                ctx.restore();
            }
        }
        
        let kirby = new Kirby();
        const welcomeText = "WELCOME";
        let letters = [...welcomeText].map((char, index) => new Letter(char, index));
        
        function checkAllLettersEaten() {
            if (letters.every(l => l.eaten)) {
                setTimeout(() => {
                    kirby.state = 'fat';
                }, 200);
            }
        }
        
        function spitLetters() {
            letters.forEach((l) => {
                l.eaten = false;
                l.x = kirby.x + 8;
                l.y = kirby.y + 4;
                // Shoot outwards
                l.vx = Math.random() * 8 + 4; // Fly to the right
                l.vy = -Math.random() * 4 - 3;
                l.scale = 0.1;
            });
            
            // Spawn colorful retro star burst
            const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ffffff'];
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 0.4 - Math.PI * 0.2; // Cone facing right
                const speed = Math.random() * 5 + 3;
                particles.push(new StarParticle(
                    kirby.x + 16, kirby.y + 4,
                    Math.cos(angle) * speed, Math.sin(angle) * speed,
                    colors[Math.floor(Math.random() * colors.length)],
                    3, 'star'
                ));
            }
        }
        
        // Background Stars
        class StaticStar {
            constructor() {
                this.x = Math.random() * WIDTH;
                this.y = Math.random() * (HEIGHT - 60);
                this.size = Math.random() * 1.5 + 0.5;
                this.brightness = Math.random();
                this.speed = Math.random() * 0.02 + 0.01;
            }
            update() {
                this.brightness += this.speed;
                if (this.brightness > 1.0 || this.brightness < 0) {
                    this.speed = -this.speed;
                }
            }
            draw(parallaxX, parallaxY) {
                ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.max(0.1, this.brightness) + ')';
                // Parallax offset (far background stars move slower)
                const px = (this.x + parallaxX * 0.2 + WIDTH) % WIDTH;
                const py = (this.y + parallaxY * 0.2 + HEIGHT) % HEIGHT;
                ctx.fillRect(px, py, this.size, this.size);
            }
        }
        
        let backgroundStars = Array.from({ length: 40 }, () => new StaticStar());
        
        // Main Loop
        function loop() {
            time++;
            ctx.clearRect(0, 0, WIDTH, HEIGHT);
            
            // Draw gradient background sky
            const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
            skyGrad.addColorStop(0, '#0a0914');
            skyGrad.addColorStop(1, '#1b122c');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            
            // Mouse parallax calculations
            const px = (WIDTH / 2 - mouse.x) * 0.1;
            const py = (HEIGHT / 2 - mouse.y) * 0.1;
            
            // Update & Draw Background Stars
            backgroundStars.forEach((star) => {
                star.update();
                star.draw(px, py);
            });
            
            // Draw neon floor grid (retro cyberpunk style)
            ctx.strokeStyle = '#2d1847';
            ctx.lineWidth = 1;
            // Horizontal lines
            for (let y = 170; y < HEIGHT; y += 10) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(WIDTH, y);
                ctx.stroke();
            }
            // Perspective vertical lines
            const gridCenter = WIDTH / 2;
            for (let i = -10; i <= 10; i++) {
                ctx.beginPath();
                ctx.moveTo(gridCenter + i * 12 + px * 0.5, 170);
                ctx.lineTo(gridCenter + i * 40 + px, HEIGHT);
                ctx.stroke();
            }
            
            // Setup Text drawing styles
            ctx.font = '8px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw & Update Particles
            particles = particles.filter(p => p.life > 0);
            particles.forEach((p) => {
                p.update(kirby);
                p.draw();
            });
            
            // Update & Draw Kirby
            kirby.update();
            ctx.save();
            ctx.translate(px * 0.3, py * 0.3);
            kirby.draw();
            ctx.restore();
            
            // Update & Draw Letters
            ctx.save();
            ctx.translate(px * 0.4, py * 0.4);
            letters.forEach((l) => {
                l.update(kirby);
                l.draw();
            });
            ctx.restore();
            
            requestAnimationFrame(loop);
        }
        
        loop();
    </script>
</body>
</html>`;
  }
}
