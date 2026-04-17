import { Component, inject, OnInit, signal, computed, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { DashboardStats, Alert, Camera } from '../../../core/models/models';

@Component({ selector:'app-dashboard', standalone:true, imports:[CommonModule,RouterLink], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Dashboard</h1>
      <p class="page-sub">Visão geral do sistema</p>
    </div>
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)">
      <span class="live"></span> Atualiza a cada 15s
    </div>
  </div>

  @if (!stats()) {
    <div class="loading"><div class="spinner"></div></div>
  } @else {

    @if (stats()!.tenant.status === 'trial') {
      <div class="trial-banner">
        ⏳ Trial ativo — expira em <strong>{{ trialDays() }} dias</strong>.
        <a routerLink="/panel/billing">Fazer upgrade →</a>
      </div>
    }

    <!-- KPI Cards -->
    <div class="metrics-grid">
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Câmeras ativas</span>
          <div class="kpi-icon kpi-icon-green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
          </div>
        </div>
        <div class="kpi-value" style="color:var(--primary)">{{ stats()!.cameras.online }}</div>
        <div class="kpi-footer">
          <span class="kpi-sub">de {{ stats()!.cameras.total }} configuradas</span>
          <div class="kpi-progress">
            <div class="kpi-prog-fill kpi-prog-green" [style.width.%]="stats()!.cameras.total > 0 ? (stats()!.cameras.online / stats()!.cameras.total * 100) : 0"></div>
          </div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Alertas hoje</span>
          <div class="kpi-icon kpi-icon-amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          </div>
        </div>
        <div class="kpi-value" [style.color]="stats()!.alerts.today > 0 ? 'var(--high)' : 'var(--text)'">{{ stats()!.alerts.today }}</div>
        <div class="kpi-footer">
          <span class="kpi-sub">{{ stats()!.alerts.critical_today }} críticos</span>
          <span class="kpi-trend" [style.color]="stats()!.alerts.critical_today > 0 ? 'var(--critical)' : 'var(--muted)'">
            {{ stats()!.alerts.critical_today > 0 ? '↑ atenção' : '✓ normal' }}
          </span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Alertas abertos</span>
          <div class="kpi-icon kpi-icon-red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        </div>
        <div class="kpi-value" [style.color]="stats()!.alerts.open > 0 ? 'var(--critical)' : 'var(--text)'">{{ stats()!.alerts.open }}</div>
        <div class="kpi-footer">
          <span class="kpi-sub">aguardando ação</span>
          <a routerLink="/panel/history" class="kpi-action">Ver →</a>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Regras ativas</span>
          <div class="kpi-icon kpi-icon-blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
        </div>
        <div class="kpi-value">{{ stats()!.rules.active }}</div>
        <div class="kpi-footer">
          <span class="kpi-sub">de {{ stats()!.rules.total }} configuradas</span>
          <div class="kpi-progress">
            <div class="kpi-prog-fill kpi-prog-blue" [style.width.%]="stats()!.rules.total > 0 ? (stats()!.rules.active / stats()!.rules.total * 100) : 0"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="grid-2">
      <!-- Alert timeline -->
      <div class="card">
        <div class="card-title-row">
          <span>Alertas — últimos 7 dias</span>
        </div>
        <div class="chart-wrap">
          <canvas #barChart></canvas>
        </div>
      </div>

      <!-- Severity donut -->
      <div class="card">
        <div class="card-title-row">
          <span>Distribuição por severidade</span>
        </div>
        <div style="display:flex;align-items:center;gap:24px;padding:8px 0">
          <div class="chart-wrap" style="width:160px;height:160px;flex-shrink:0">
            <canvas #donutChart></canvas>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:10px">
            @for (item of donutLegend(); track item.label) {
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:10px;height:10px;border-radius:50%" [style.background]="item.color"></div>
                  <span style="font-size:12px;color:var(--muted)">{{ item.label }}</span>
                </div>
                <span style="font-size:13px;font-weight:600">{{ item.value }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Plan usage bar -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:13px;font-weight:600">Uso do plano <span class="badge medium" style="margin-left:6px">{{ stats()!.plan.name }}</span></span>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        @for (item of usageItems(); track item.label) {
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
              <span style="font-weight:500">{{ item.label }}</span>
              <span style="color:var(--muted)">{{ item.used }} / {{ item.max }}</span>
            </div>
            <div class="usage-bar"><div class="fill" [class.warn]="item.pct>70" [class.over]="item.pct>90" [style.width.%]="item.pct"></div></div>
          </div>
        }
      </div>
    </div>

    <!-- Cameras + Recent alerts -->
    <div class="grid-2">
      <div class="card">
        <div class="card-title-row">
          <span>Câmeras</span>
          <a routerLink="/panel/cameras" class="card-link">Ver todas →</a>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          @for (cam of cameras(); track cam.id) {
            <div class="cam-thumb">
              <div class="cam-screen">
                @if (cam.snapshot_url) { <img [src]="cam.snapshot_url" style="width:100%;height:100%;object-fit:cover"/> }
                @else { <div class="cam-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg></div> }
                <span [class]="'badge ' + cam.status" style="position:absolute;top:6px;right:6px;font-size:10px">{{ cam.status }}</span>
              </div>
              <div class="cam-label">
                <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ cam.name }}</div>
                <div style="font-size:11px;color:var(--muted)">{{ cam.location }}</div>
              </div>
            </div>
          }
        </div>
      </div>

      <div class="card">
        <div class="card-title-row">
          <span>Alertas recentes</span>
          <a routerLink="/panel/history" class="card-link">Ver todos →</a>
        </div>
        @if (alerts().length === 0) {
          <div class="empty" style="padding:28px 0"><div class="empty-icon">✅</div><h4>Sem alertas</h4></div>
        } @else {
          <div style="display:flex;flex-direction:column">
            @for (a of alerts(); track a.id) {
              <div class="alert-row">
                <div class="alert-dot" [style.background]="sevColor(a.rule_severity)"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ a.rule_name }}</div>
                  <div style="font-size:11px;color:var(--muted)">{{ a.camera_name }}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <div style="font-size:11px;color:var(--muted)">{{ fmtTime(a.triggered_at) }}</div>
                  <span [class]="'badge ' + a.status" style="font-size:10px">{{ a.status }}</span>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  }
</div>
`, styles:[`
.card-title-row { display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-size:13px;font-weight:600 }
.card-link { font-size:12px;color:var(--primary);font-weight:500 }
.chart-wrap { position:relative;width:100%;height:180px }
.cam-thumb { border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;transition:box-shadow .2s;&:hover{box-shadow:var(--shadow)} }
.cam-screen { height:80px;background:#0f172a;position:relative;display:flex;align-items:center;justify-content:center }
.cam-placeholder { display:flex;align-items:center;justify-content:center;width:100%;height:100% }
.cam-label { padding:7px 10px;background:#fafbfc }
.alert-row { display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,.04);&:last-child{border:none} }
.alert-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0 }
.trial-banner { background:#fffbeb;border:1px solid #fde68a;border-radius:var(--r-sm);padding:12px 18px;font-size:13px;color:#92400e;display:flex;justify-content:space-between;align-items:center;a{color:var(--primary);font-weight:600} }

.kpi-card { background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;box-shadow:0 2px 8px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04);display:flex;flex-direction:column;gap:12px;transition:all .25s ease; }
.kpi-card:hover { box-shadow:0 8px 24px rgba(0,0,0,.09),0 2px 6px rgba(0,0,0,.05);transform:translateY(-2px); }
.kpi-top { display:flex;justify-content:space-between;align-items:flex-start; }
.kpi-label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted); }
.kpi-icon { width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center; }
.kpi-icon-green { background:var(--primary-light);color:var(--primary); }
.kpi-icon-amber { background:#fffbeb;color:#D97706; }
.kpi-icon-red { background:#fff1f1;color:#DC2626; }
.kpi-icon-blue { background:#eff6ff;color:#2563EB; }
.kpi-value { font-size:38px;font-weight:800;letter-spacing:-2px;line-height:1; }
.kpi-footer { display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:4px;border-top:1px solid rgba(0,0,0,.05); }
.kpi-sub { font-size:12px;color:var(--muted); }
.kpi-trend { font-size:11px;font-weight:600; }
.kpi-action { font-size:12px;color:var(--primary);font-weight:600; }
.kpi-progress { flex:1;height:4px;background:#e2e8f0;border-radius:99px;overflow:hidden;max-width:70px; }
.kpi-prog-fill { height:100%;border-radius:99px;transition:width .5s ease; }
.kpi-prog-green { background:var(--primary); }
.kpi-prog-blue { background:#3B82F6; }
`]})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('donutChart') donutChartRef!: ElementRef<HTMLCanvasElement>;

  private api = inject(ApiService);
  stats   = signal<DashboardStats | null>(null);
  alerts  = signal<Alert[]>([]);
  cameras = signal<Camera[]>([]);
  allAlerts = signal<Alert[]>([]);

  private chartsReady = false;

  donutLegend = computed(() => {
    const all = this.allAlerts();
    const count = (sev: string) => all.filter(a => a.rule_severity === sev).length;
    return [
      { label: 'Crítico',  color: 'var(--critical)', value: count('critical') },
      { label: 'Alto',     color: 'var(--high)',     value: count('high') },
      { label: 'Médio',    color: 'var(--medium)',   value: count('medium') },
      { label: 'Baixo',    color: 'var(--low)',      value: count('low') },
    ];
  });

  usageItems() {
    const s = this.stats();
    if (!s) return [];
    return [
      { label:'Câmeras',  used:s.plan.used_cameras, max:s.plan.max_cameras, pct:Math.round(s.plan.used_cameras/s.plan.max_cameras*100) },
      { label:'Usuários', used:s.plan.used_users,   max:s.plan.max_users,   pct:Math.round(s.plan.used_users/s.plan.max_users*100) },
      { label:'Regras',   used:s.plan.used_rules,   max:s.plan.max_rules,   pct:Math.round(s.plan.used_rules/s.plan.max_rules*100) },
    ];
  }

  trialDays() {
    const s = this.stats();
    if (!s?.tenant.trial_ends_at) return 0;
    return Math.max(0, Math.ceil((new Date(s.tenant.trial_ends_at).getTime() - Date.now()) / 86400000));
  }

  ngOnInit() {
    this.load();
    setInterval(() => this.load(), 15000);
  }

  ngAfterViewInit() {
    this.chartsReady = true;
    if (this.allAlerts().length > 0) this.renderCharts();
  }

  load() {
    this.api.getDashboard().subscribe(s => this.stats.set(s));
    this.api.getAlerts({ ordering:'-triggered_at', page_size:'8' }).subscribe((r: any) => {
      const list = Array.isArray(r) ? r : (r.results ?? []);
      this.alerts.set(list.slice(0, 8));
    });
    this.api.getCameras().subscribe((c: any[]) => this.cameras.set(c.slice(0,4)));
    this.api.getAlerts({ ordering:'-triggered_at', page_size:'200' }).subscribe((r: any) => {
      const list = Array.isArray(r) ? r : (r.results ?? []);
      this.allAlerts.set(list);
      if (this.chartsReady) this.renderCharts();
    });
  }

  renderCharts() {
    this.tryDraw(0);
  }

  tryDraw(attempts: number) {
    if (attempts > 30) return;
    const Chart = (window as any).Chart;
    const barCanvas = this.barChartRef?.nativeElement;
    const donutCanvas = this.donutChartRef?.nativeElement;
    if (!Chart || !barCanvas || !donutCanvas) {
      setTimeout(() => this.tryDraw(attempts + 1), 100);
      return;
    }
    this.drawBarChart(barCanvas, Chart);
    this.drawDonutChart(donutCanvas, Chart);
  }

  private barChart: any = null;
  private donutChart: any = null;

  drawBarChart(canvas: HTMLCanvasElement, Chart: any) {
    const all = this.allAlerts();
    const days: string[] = [];
    const counts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }));
      const dayStr = d.toISOString().slice(0, 10);
      counts.push(all.filter((a: any) => a.triggered_at?.slice(0, 10) === dayStr).length);
    }
    if (this.barChart) { this.barChart.destroy(); this.barChart = null; }
    this.barChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          label: 'Alertas',
          data: counts,
          backgroundColor: 'rgba(29,158,117,.18)',
          borderColor: '#1D9E75',
          borderWidth: 2,
          borderRadius: 7,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(29,158,117,.35)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#94a3b8',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items: any[]) => items[0].label,
              label: (item: any) => ` ${item.raw} alertas`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11, family: 'Inter' }, color: '#64748b' }
          },
          y: {
            grid: { color: 'rgba(0,0,0,.05)', drawBorder: false },
            border: { display: false },
            ticks: { font: { size: 11, family: 'Inter' }, color: '#64748b', stepSize: 1, precision: 0 },
            beginAtZero: true
          }
        }
      }
    });
  }

  drawDonutChart(canvas: HTMLCanvasElement, Chart: any) {
    const legend = this.donutLegend();
    const total = legend.reduce((s: number, i: any) => s + i.value, 0);
    if (this.donutChart) { this.donutChart.destroy(); this.donutChart = null; }
    if (total === 0) return;
    this.donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: legend.map((l: any) => l.label),
        datasets: [{
          data: legend.map((l: any) => l.value),
          backgroundColor: ['#E24B4A', '#F59E0B', '#3B82F6', '#1D9E75'],
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 6,
          hoverBorderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#94a3b8',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx: any) => ` ${ctx.raw} alertas (${Math.round(ctx.raw / total * 100)}%)`
            }
          }
        }
      }
    });
  }


  sevColor(s: string): string {
    const m: {[k:string]:string} = { critical:'var(--critical)', high:'var(--high)', medium:'var(--medium)', low:'var(--low)' };
    return m[s] ?? '#999';
  }
  fmtTime(dt: string) { return new Date(dt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
}
