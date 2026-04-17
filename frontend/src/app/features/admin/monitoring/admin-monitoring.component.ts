import { Component, inject, OnInit, OnDestroy, signal, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

const MAX_HISTORY = 30; // 30 data points

@Component({ selector:'app-admin-monitoring', standalone:true, imports:[CommonModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Monitoramento</h1>
      <p class="page-sub">Performance em tempo real — atualiza a cada {{ interval }}s</p>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)">
        <span class="live" [class.live-off]="!m()"></span>
        {{ history().length }} amostras
      </div>
      <button class="btn sm ghost" (click)="load()">↺ Agora</button>
      <button class="btn sm ghost" (click)="clearHistory()" style="color:var(--muted)">Limpar histórico</button>
    </div>
  </div>

  @if (!m()) {
    <div class="loading"><div class="spinner"></div></div>
  } @else {

    <!-- Resource gauges -->
    <div class="mon-grid-4">
      @for (g of gauges(); track g.key) {
        <div class="gauge-card" [class.gauge-warn]="g.value > g.warnAt" [class.gauge-crit]="g.value > g.critAt">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div class="gauge-val" [style.color]="g.value > g.critAt ? 'var(--critical)' : g.value > g.warnAt ? 'var(--high)' : g.color">
                {{ g.value }}{{ g.unit }}
              </div>
              <div class="gauge-label">{{ g.label }}</div>
              <div class="gauge-sub">{{ g.sub }}</div>
            </div>
            <div class="gauge-icon" [style.background]="g.bg" [style.color]="g.color" [innerHTML]="g.icon"></div>
          </div>
          <!-- Spark chart -->
          <canvas [attr.data-key]="g.key" class="spark-canvas" height="40"></canvas>
          <!-- Bar -->
          <div class="gauge-bar">
            <div class="gauge-fill"
              [style.width.%]="g.value"
              [style.background]="g.value > g.critAt ? 'var(--critical)' : g.value > g.warnAt ? 'var(--high)' : g.color">
            </div>
          </div>
        </div>
      }
    </div>

    <!-- App metrics row -->
    <div class="mon-grid-4">
      <div class="app-stat" [class.app-warn]="m()!.queue_cameras > 20">
        <div class="as-val" [style.color]="m()!.queue_cameras > 20 ? 'var(--critical)' : 'var(--text)'">{{ m()!.queue_cameras }}</div>
        <div class="as-label">Fila Celery</div>
        <div class="as-trend">{{ queueTrend() }}</div>
      </div>
      <div class="app-stat">
        <div class="as-val" style="color:var(--primary)">{{ m()!.cameras_online }}/{{ m()!.cameras_total }}</div>
        <div class="as-label">Câmeras online</div>
        <div class="as-trend">{{ m()!.cameras_active }} ativas</div>
      </div>
      <div class="app-stat">
        <div class="as-val" [style.color]="m()!.alerts_open > 0 ? 'var(--critical)' : 'var(--primary)'">{{ m()!.alerts_open }}</div>
        <div class="as-label">Alertas abertos</div>
        <div class="as-trend">{{ m()!.alerts_last_hour }} última hora</div>
      </div>
      <div class="app-stat">
        <div class="as-val" style="color:#2563EB">{{ m()!.frames_per_second }}<span style="font-size:14px">/s</span></div>
        <div class="as-label">Frames/seg</div>
        <div class="as-trend">~{{ m()!.frames_per_minute }}/min</div>
      </div>
    </div>

    <!-- Main charts -->
    <div class="grid-2">
      <!-- CPU over time -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:13px;font-weight:600">CPU % — histórico</span>
          <span class="badge medium">{{ m()!.cpu_count }} núcleos</span>
        </div>
        <canvas #cpuChart style="width:100%;height:160px"></canvas>
      </div>

      <!-- Memory over time -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:13px;font-weight:600">RAM % — histórico</span>
          <span class="badge medium">{{ m()!.mem_total_gb }}GB total</span>
        </div>
        <canvas #memChart style="width:100%;height:160px"></canvas>
      </div>
    </div>

    <div class="grid-2">
      <!-- Celery queue over time -->
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px">Fila Celery — histórico</div>
        <canvas #queueChart style="width:100%;height:140px"></canvas>
      </div>

      <!-- Alerts last 12h -->
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px">Alertas por hora (12h)</div>
        <canvas #alertsChart style="width:100%;height:140px"></canvas>
      </div>
    </div>

    <!-- Config + top cameras -->
    <div class="grid-2">
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px">Configuração atual</div>
        <div style="display:flex;flex-direction:column;gap:0">
          @for (row of configRows(); track row.label) {
            <div class="cfg-row">
              <span>{{ row.label }}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <div class="cfg-bar-wrap">
                  <div class="cfg-bar-fill" [style.width.%]="row.pct" [style.background]="row.color"></div>
                </div>
                <span class="cfg-val" [style.color]="row.color">{{ row.value }}</span>
              </div>
            </div>
          }
          <div class="cfg-row">
            <span>Redis</span>
            <span class="cfg-val" [style.color]="m()!.redis_connected ? 'var(--primary)' : 'var(--critical)'">
              {{ m()!.redis_connected ? '✓ Conectado' : '✗ Offline' }}
            </span>
          </div>
          <div class="cfg-row"><span>Modelo YOLO</span><span class="cfg-val">{{ m()!.yolo_model }}</span></div>
          <div class="cfg-row"><span>Uptime</span><span class="cfg-val">{{ m()!.uptime_str }}</span></div>
          <div class="cfg-row"><span>Threads</span><span class="cfg-val">{{ m()!.proc_threads }}</span></div>
          <div class="cfg-row"><span>Processo RAM</span><span class="cfg-val">{{ m()!.proc_mem_mb }}MB</span></div>
        </div>
      </div>

      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px">Top câmeras — alertas 24h</div>
        @if (!m()!.top_cameras?.length) {
          <div class="empty" style="padding:20px"><p>Sem alertas nas últimas 24h</p></div>
        } @else {
          <div style="display:flex;flex-direction:column;gap:10px">
            @for (cam of m()!.top_cameras; track cam.camera_id) {
              <div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                  <span style="font-weight:500">{{ cam.camera__name }}</span>
                  <strong>{{ cam.count }}</strong>
                </div>
                <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
                  <div style="height:100%;background:var(--primary);border-radius:99px;transition:width .4s"
                       [style.width.%]="camPct(cam.count)"></div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Severity breakdown -->
        <div style="font-size:13px;font-weight:600;margin:18px 0 10px">Severidade — 24h</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          @for (sev of severities; track sev.key) {
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0" [style.background]="sev.color"></div>
              <span style="font-size:12px;flex:1">{{ sev.label }}</span>
              <div style="flex:2;height:5px;background:#e2e8f0;border-radius:99px;overflow:hidden">
                <div style="height:100%;border-radius:99px" [style.width.%]="sevPct(sev.key)" [style.background]="sev.color"></div>
              </div>
              <strong style="font-size:12px;min-width:24px;text-align:right">{{ m()!.alerts_by_severity?.[sev.key] || 0 }}</strong>
            </div>
          }
        </div>
      </div>
    </div>
  }
</div>
`, styles:[`
.mon-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.live-off{background:#cbd5e1!important;animation:none!important}

/* Gauge cards */
.gauge-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;box-shadow:var(--shadow-sm);transition:all .2s}
.gauge-card.gauge-warn{border-color:#fcd34d}
.gauge-card.gauge-crit{border-color:var(--critical);background:#fff8f8}
.gauge-val{font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1}
.gauge-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-top:2px}
.gauge-sub{font-size:11px;color:var(--hint);margin-top:2px}
.gauge-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.gauge-bar{height:5px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-top:6px}
.gauge-fill{height:100%;border-radius:99px;transition:width .5s ease}
.spark-canvas{width:100%;display:block}

/* App stats */
.app-stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px;box-shadow:var(--shadow-sm)}
.app-stat.app-warn{border-color:var(--critical)}
.as-val{font-size:28px;font-weight:800;letter-spacing:-1px}
.as-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-top:2px}
.as-trend{font-size:11px;color:var(--hint);margin-top:2px}

/* Config rows */
.cfg-row{display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:7px 0;border-bottom:1px solid var(--border);&:last-child{border:none}}
.cfg-val{font-weight:600}
.cfg-bar-wrap{width:60px;height:4px;background:#e2e8f0;border-radius:99px;overflow:hidden}
.cfg-bar-fill{height:100%;border-radius:99px;transition:width .3s}
`]})
export class AdminMonitoringComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('cpuChart,memChart,queueChart,alertsChart') chartRefs!: QueryList<ElementRef<HTMLCanvasElement>>;

  private api    = inject(ApiService);
  m              = signal<any>(null);
  history        = signal<any[]>([]);
  interval       = 5;
  private timer: any;
  private chartsReady = false;

  severities = [
    { key:'critical', label:'Crítico', color:'#DC2626' },
    { key:'high',     label:'Alto',    color:'#F59E0B' },
    { key:'medium',   label:'Médio',   color:'#3B82F6' },
    { key:'low',      label:'Baixo',   color:'#10B981' },
  ];

  gauges = () => {
    const d = this.m();
    if (!d) return [];
    return [
      { key:'cpu',  label:'CPU',    value:d.cpu_percent,  unit:'%', warnAt:60, critAt:80, color:'#2563EB', bg:'#eff6ff', sub:`${d.cpu_count} núcleos · proc: ${d.proc_cpu}%`, icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>' },
      { key:'mem',  label:'Memória', value:d.mem_percent,  unit:'%', warnAt:70, critAt:85, color:'#9333ea', bg:'#fdf4ff', sub:`${d.mem_used_gb}GB / ${d.mem_total_gb}GB`, icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' },
      { key:'disk', label:'Disco',   value:d.disk_percent, unit:'%', warnAt:70, critAt:85, color:'#ca8a04', bg:'#fefce8', sub:`${d.disk_used_gb}GB / ${d.disk_total_gb}GB`, icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' },
      { key:'net',  label:'Rede',    value:d.proc_cpu,     unit:'%', warnAt:50, critAt:80, color:'#059669', bg:'#ecfdf5', sub:`↑${d.net_sent_mb}MB ↓${d.net_recv_mb}MB`, icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>' },
    ];
  };

  configRows = () => {
    const d = this.m();
    if (!d) return [];
    return [
      { label:'FPS análise',   value:`${d.analysis_fps}/s`, pct: Math.min(100, (d.analysis_fps/5)*100), color:'var(--primary)' },
      { label:'Confiança',     value:`${(+d.detection_conf*100).toFixed(0)}%`, pct: +d.detection_conf*100, color:'#2563EB' },
    ];
  };

  queueTrend(): string {
    const h = this.history();
    if (h.length < 2) return '';
    const prev = h[h.length-2]?.queue_cameras ?? 0;
    const curr = h[h.length-1]?.queue_cameras ?? 0;
    if (curr > prev) return `↑ +${curr - prev}`;
    if (curr < prev) return `↓ -${prev - curr}`;
    return '→ estável';
  }

  ngOnInit() { this.load(); this.timer = setInterval(() => this.load(), this.interval * 1000); }
  ngAfterViewInit() { this.chartsReady = true; }
  ngOnDestroy() { clearInterval(this.timer); }

  clearHistory() { this.history.set([]); }

  load() {
    this.api.getSystemMetrics().subscribe({
      next: d => {
        this.m.set(d);
        const ts = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        this.history.update(h => [...h.slice(-(MAX_HISTORY-1)), {...d, ts}]);
        if (this.chartsReady) {
          setTimeout(() => this.drawAllCharts(), 50);
        }
      },
      error: () => {}
    });
  }

  drawAllCharts() {
    const h = this.history();
    if (!h.length || !this.chartRefs) return;

    const getCanvas = (idx: number) => this.chartRefs.toArray()[idx]?.nativeElement;
    this.drawLineChart(getCanvas(0), h.map(d => d.cpu_percent),    '#2563EB', 0, 100, '%');
    this.drawLineChart(getCanvas(1), h.map(d => d.mem_percent),    '#9333ea', 0, 100, '%');
    this.drawLineChart(getCanvas(2), h.map(d => d.queue_cameras),  '#D97706', 0, null, '');
    this.drawBarChart(getCanvas(3),  this.m()?.alerts_by_hour ?? [], '#1D9E75');

    // Sparklines inside gauge cards
    const keys = ['cpu','mem','disk','net'];
    const sparkKeys = ['cpu_percent','mem_percent','disk_percent','proc_cpu'];
    const sparkColors = ['#2563EB','#9333ea','#ca8a04','#059669'];
    keys.forEach((key, i) => {
      const canvas = document.querySelector(`[data-key="${key}"]`) as HTMLCanvasElement;
      if (canvas) this.drawSparkline(canvas, h.map((d: any) => d[sparkKeys[i]] ?? 0), sparkColors[i]);
    });
  }

  drawLineChart(canvas: HTMLCanvasElement | null, data: number[], color: string, yMin: number, yMax: number|null, unit: string) {
    if (!canvas || !data.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 400, H = 160;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const pad = {top:16, right:12, bottom:24, left:36};
    const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
    const max = yMax ?? Math.max(...data, 1);

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + ch - (i/4)*ch;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+cw, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(max*i/4) + unit, pad.left-4, y+3);
    }

    if (data.length < 2) return;
    const stepX = cw / (data.length - 1);

    // Fill gradient
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top+ch);
    grad.addColorStop(0, color + '33');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad.left + i*stepX;
      const y = pad.top + ch - ((v-yMin)/(max-yMin||1))*ch;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (data.length-1)*stepX, pad.top+ch);
    ctx.lineTo(pad.left, pad.top+ch);
    ctx.closePath(); ctx.fill();

    // Line
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad.left + i*stepX;
      const y = pad.top + ch - ((v-yMin)/(max-yMin||1))*ch;
      i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.stroke();

    // Last value dot + label
    const lastY = pad.top + ch - ((data[data.length-1]-yMin)/(max-yMin||1))*ch;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(pad.left+(data.length-1)*stepX, lastY, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = color; ctx.font = 'bold 11px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(data[data.length-1] + unit, W-4, lastY-6);

    // Time labels
    const h = this.history();
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'center';
    [0, Math.floor(data.length/2), data.length-1].forEach(i => {
      if (h[i]) ctx.fillText(h[i].ts?.slice(0,5) ?? '', pad.left + i*stepX, H-4);
    });
  }

  drawBarChart(canvas: HTMLCanvasElement | null, data: {hour:string,count:number}[], color: string) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 400, H = 140;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    if (!data.length) { ctx.fillStyle='#94a3b8'; ctx.font='12px Inter'; ctx.textAlign='center'; ctx.fillText('Sem dados', W/2, H/2); return; }
    const pad = {top:12,right:8,bottom:24,left:28};
    const cw = W-pad.left-pad.right, ch = H-pad.top-pad.bottom;
    const max = Math.max(...data.map(d=>d.count), 1);
    const bw = Math.max(4, cw/data.length*0.7);
    const gap = cw/data.length;
    data.forEach((d, i) => {
      const x = pad.left + i*gap + gap/2 - bw/2;
      const bh = (d.count/max)*ch;
      const y = pad.top+ch-bh;
      ctx.fillStyle = color+'33';
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (bh > 4) { ctx.roundRect(x,y,bw,bh,3); } else { ctx.rect(x,pad.top+ch-2,bw,2); }
      ctx.fill(); ctx.stroke();
      if (d.count > 0) { ctx.fillStyle=color; ctx.font='bold 10px Inter'; ctx.textAlign='center'; ctx.fillText(String(d.count), x+bw/2, y-3); }
      ctx.fillStyle='#94a3b8'; ctx.font='9px Inter'; ctx.textAlign='center';
      ctx.fillText(d.hour, x+bw/2, H-6);
    });
  }

  drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string) {
    if (!canvas || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 200, H = 40;
    canvas.width = W*dpr; canvas.height = H*dpr;
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const max = Math.max(...data, 1), min = Math.min(...data, 0);
    const stepX = W/(data.length-1);
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, color+'44'); grad.addColorStop(1, color+'00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    data.forEach((v,i) => {
      const x=i*stepX, y=H-((v-min)/(max-min||1))*H*0.85-2;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.lineTo((data.length-1)*stepX,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.lineJoin='round';
    ctx.beginPath();
    data.forEach((v,i) => {
      const x=i*stepX, y=H-((v-min)/(max-min||1))*H*0.85-2;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  sevPct(key: string): number {
    const total = Object.values(this.m()?.alerts_by_severity ?? {}).reduce((a:any,b:any)=>a+b,0) as number;
    return total ? ((this.m()?.alerts_by_severity?.[key]??0)/total)*100 : 0;
  }
  camPct(count: number): number {
    const max = Math.max(...(this.m()?.top_cameras?.map((c:any)=>c.count)??[1]),1);
    return (count/max)*100;
  }
}
