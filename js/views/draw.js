/**
 * draw.js — Drawing & coloring board with grid backgrounds
 */

export function renderDraw(container) {
  container.innerHTML = `
    <div class="page-hd" style="margin-bottom:var(--s5);">
      <div class="page-hd-text"><h2>لوحة الرسم</h2></div>
      <div style="display:flex;gap:var(--s4);">
        <button class="btn btn-secondary btn-sm" id="draw-save">💾 حفظ صورة</button>
        <button class="btn btn-ghost btn-sm" id="draw-clear">🗑️ مسح الكل</button>
      </div>
    </div>
    <div class="draw-layout">
      <!-- Toolbar -->
      <div class="draw-toolbar" id="draw-toolbar">
        <!-- Tools -->
        <button class="draw-tool-btn active" data-tool="pen"   title="قلم">✏️</button>
        <button class="draw-tool-btn"         data-tool="brush" title="فرشاة">🖌️</button>
        <button class="draw-tool-btn"         data-tool="eraser" title="ممحاة">🧹</button>
        <button class="draw-tool-btn"         data-tool="line"   title="خط">╱</button>
        <button class="draw-tool-btn"         data-tool="rect"   title="مستطيل">▭</button>
        <button class="draw-tool-btn"         data-tool="circle" title="دائرة">○</button>
        <div class="draw-toolbar-sep"></div>
        <!-- Size slider -->
        <input type="range" class="draw-size-slider" id="draw-size" min="1" max="40" value="4" title="الحجم">
        <div class="draw-toolbar-sep"></div>
        <!-- Colors -->
        <div class="draw-color-row">
          ${['#1A1A2E','#EF4444','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#FFFFFF']
            .map(c=>`<div class="draw-color-swatch ${c==='#1A1A2E'?'active':''}" style="background:${c}" data-color="${c}" title="${c}"></div>`).join('')}
        </div>
        <input type="color" id="draw-custom-color" value="#1A1A2E" title="لون مخصص"
          style="width:44px;height:44px;border-radius:var(--r3);border:1.5px solid var(--border);cursor:pointer;padding:2px;background:var(--input-bg);">
        <div class="draw-toolbar-sep"></div>
        <!-- Backgrounds -->
        <button class="draw-bg-btn active" data-bg="white" title="أبيض">⬜</button>
        <button class="draw-bg-btn" data-bg="grid"   title="شبكة">⊞</button>
        <button class="draw-bg-btn" data-bg="dots"   title="نقاط">⠿</button>
        <button class="draw-bg-btn" data-bg="lined"  title="مسطر">≡</button>
        <button class="draw-bg-btn" data-bg="math"   title="رياضيات">#</button>
      </div>
      <!-- Canvas -->
      <div class="draw-canvas-wrap">
        <canvas id="draw-canvas"></canvas>
      </div>
    </div>
  `;

  initCanvas(container);
}

function initCanvas(container) {
  const canvas  = container.querySelector('#draw-canvas');
  const wrap    = canvas.parentElement;
  const ctx     = canvas.getContext('2d');

  let tool       = 'pen';
  let color      = '#1A1A2E';
  let lineWidth  = 4;
  let bg         = 'white';
  let drawing    = false;
  let startX     = 0;
  let startY     = 0;
  let snapshot   = null;   // For shape preview

  // Resize canvas to wrapper
  function resize() {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width  = W;
    canvas.height = H;
    drawBackground();
    ctx.putImageData(imageData, 0, 0);
  }

  function drawBackground() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.save();
  const isDark = document.body.getAttribute('data-theme') === 'dark';
ctx.fillStyle = bg === 'white' ? '#FFFFFF' : (isDark ? '#14142A' : '#FFFFFF');
    // Always white background for drawing
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    if (bg === 'grid' || bg === 'math') {
      const step = bg === 'math' ? 20 : 30;
      ctx.strokeStyle = '#CCCCCC';
      ctx.lineWidth   = bg === 'math' ? 0.5 : 0.8;
      for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      if (bg === 'math') {
        ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 1;
        for (let x=0;x<=W;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
        for (let y=0;y<=H;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      }
    } else if (bg === 'dots') {
      ctx.fillStyle = '#BBBBBB';
      for (let x=20;x<W;x+=25) for (let y=20;y<H;y+=25) {
        ctx.beginPath(); ctx.arc(x,y,1.5,0,Math.PI*2); ctx.fill();
      }
    } else if (bg === 'lined') {
      ctx.strokeStyle = '#CCCCCC'; ctx.lineWidth = 1;
      for (let y=40;y<=H;y+=32) {
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing  = true;
    const {x,y} = getPos(e);
    startX = x; startY = y;
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'pen' || tool === 'brush' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }

  function doDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const {x,y} = getPos(e);

    ctx.lineWidth   = tool === 'eraser' ? lineWidth * 4 : lineWidth;
    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    ctx.fillStyle   = color;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'brush') {
      ctx.globalAlpha = 0.6;
      ctx.lineWidth   = lineWidth * 2.5;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // Shape preview: restore snapshot then draw
      ctx.putImageData(snapshot, 0, 0);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = lineWidth;

      if (tool === 'line') {
        ctx.moveTo(startX, startY); ctx.lineTo(x, y); ctx.stroke();
      } else if (tool === 'rect') {
        ctx.strokeRect(startX, startY, x-startX, y-startY);
      } else if (tool === 'circle') {
        const r = Math.sqrt((x-startX)**2+(y-startY)**2);
        ctx.arc(startX, startY, r, 0, Math.PI*2); ctx.stroke();
      }
    }
  }

  function endDraw(e) {
    if (!drawing) return;
    drawing   = false;
    snapshot  = null;
    ctx.closePath();
    ctx.globalAlpha = 1;
  }

  // Bind canvas events
  canvas.addEventListener('mousedown',  startDraw);
  canvas.addEventListener('mousemove',  doDraw);
  canvas.addEventListener('mouseup',    endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive:false });
  canvas.addEventListener('touchmove',  doDraw,    { passive:false });
  canvas.addEventListener('touchend',   endDraw);

  // Tool buttons
  container.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tool = btn.dataset.tool;
      canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    });
  });

  // Color swatches
  container.querySelectorAll('.draw-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      container.querySelectorAll('.draw-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      color = sw.dataset.color;
      container.querySelector('#draw-custom-color').value = color;
    });
  });

  // Custom color picker
  container.querySelector('#draw-custom-color').addEventListener('input', e => {
    color = e.target.value;
    container.querySelectorAll('.draw-color-swatch').forEach(s => s.classList.remove('active'));
  });

  // Size slider
  container.querySelector('#draw-size').addEventListener('input', e => {
    lineWidth = parseInt(e.target.value, 10);
  });

  // Background buttons
  container.querySelectorAll('[data-bg]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-bg]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bg = btn.dataset.bg;
      drawBackground();
    });
  });

  // Clear canvas
  container.querySelector('#draw-clear').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
  });

  // Save canvas as image
  container.querySelector('#draw-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `رسم-${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Initial resize
  new ResizeObserver(resize).observe(wrap);
  setTimeout(resize, 50);
}
