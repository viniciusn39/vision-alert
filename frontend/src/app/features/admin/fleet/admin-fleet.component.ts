import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

@Component({ selector:'app-admin-fleet', standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Edge Devices</h1>
      <p class="page-sub">{{ devices().length }} dispositivo{{ devices().length !== 1 ? 's' : '' }} em campo</p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn sm ghost" (click)="load()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
        Atualizar
      </button>
      <button class="btn primary" (click)="openProvision()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Provisionar device
      </button>
    </div>
  </div>

  <!-- KPI cards -->
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-val" style="color:var(--primary)">{{ stats().total }}</div>
      <div class="kpi-label">Total</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val" style="color:var(--primary)">{{ stats().online }}</div>
      <div class="kpi-label">Online</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val" style="color:var(--muted)">{{ stats().offline }}</div>
      <div class="kpi-label">Offline</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val" style="color:var(--medium)">{{ stats().cameras }}</div>
      <div class="kpi-label">Cameras ativas</div>
    </div>
  </div>

  @if (loading()) {
    <div class="loading"><div class="spinner"></div></div>
  } @else if (devices().length === 0) {
    <div class="empty">
      <div class="empty-icon">📡</div>
      <h4>Nenhum dispositivo em campo</h4>
      <p>Provisione um edge device para comecar</p>
      <button class="btn primary" style="margin-top:16px" (click)="openProvision()">+ Provisionar device</button>
    </div>
  } @else {
    <!-- Device list -->
    <div class="device-grid">
      @for (d of devices(); track d.id) {
        <div class="device-card" [class.device-online]="d.is_online" [class.device-offline]="!d.is_online">
          <div class="device-header">
            <div class="device-status">
              <span class="status-dot" [class.dot-on]="d.is_online" [class.dot-off]="!d.is_online"></span>
              <span class="status-text">{{ d.is_online ? 'Online' : 'Offline' }}</span>
            </div>
            <span class="device-version">v{{ d.software_version || '—' }}</span>
          </div>

          <div class="device-name">{{ d.name }}</div>
          <div class="device-tenant">{{ d.tenant_name }}</div>

          <div class="device-specs">
            <div class="spec" title="GPU">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="2"/><line x1="6" y1="11" x2="6" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/><line x1="14" y1="11" x2="14" y2="13"/></svg>
              {{ d.gpu_model || 'N/A' }}
            </div>
            <div class="spec" title="Cameras">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
              {{ d.cameras_active }}/{{ d.cameras_total }} cam
            </div>
          </div>

          @if (d.is_online) {
            <div class="device-metrics">
              <div class="metric-bar">
                <span class="metric-label">CPU</span>
                <div class="bar-track"><div class="bar-fill" [style.width.%]="d.cpu_percent || 0" [class.bar-warn]="d.cpu_percent > 70" [class.bar-crit]="d.cpu_percent > 90"></div></div>
                <span class="metric-val">{{ d.cpu_percent || 0 }}%</span>
              </div>
              <div class="metric-bar">
                <span class="metric-label">GPU</span>
                <div class="bar-track"><div class="bar-fill" [style.width.%]="d.gpu_percent || 0" [class.bar-warn]="d.gpu_percent > 70" [class.bar-crit]="d.gpu_percent > 90"></div></div>
                <span class="metric-val">{{ d.gpu_percent || 0 }}%</span>
              </div>
              <div class="metric-bar">
                <span class="metric-label">RAM</span>
                <div class="bar-track"><div class="bar-fill" [style.width.%]="d.ram_percent || 0" [class.bar-warn]="d.ram_percent > 80" [class.bar-crit]="d.ram_percent > 95"></div></div>
                <span class="metric-val">{{ d.ram_percent || 0 }}%</span>
              </div>
            </div>
          }

          <div class="device-footer">
            <span class="device-seen">{{ d.last_heartbeat ? fmtRelative(d.last_heartbeat) : 'Nunca visto' }}</span>
            <div class="device-actions">
              <button class="da-btn" (click)="openDetail(d)" title="Detalhes">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </button>
              <button class="da-btn da-logs" (click)="openLogs(d)" title="Logs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  }
</div>

<!-- Detail modal -->
@if (detailDevice()) {
  <div class="modal-backdrop" (click)="detailDevice.set(null)">
    <div class="modal" style="max-width:600px" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3>{{ detailDevice()!.name }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">{{ detailDevice()!.tenant_name }}</p>
        </div>
        <button class="btn ghost sm" (click)="detailDevice.set(null)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>

      <div class="detail-grid">
        <div class="detail-item"><span class="dl">Device ID</span><code>{{ detailDevice()!.id }}</code></div>
        <div class="detail-item"><span class="dl">Status</span><span [class.tag-on]="detailDevice()!.is_online" [class.tag-off]="!detailDevice()!.is_online" class="tag-status">{{ detailDevice()!.is_online ? 'Online' : 'Offline' }}</span></div>
        <div class="detail-item"><span class="dl">GPU</span><span>{{ detailDevice()!.gpu_model || 'N/A' }}</span></div>
        <div class="detail-item"><span class="dl">CPU</span><span>{{ detailDevice()!.cpu_model || 'N/A' }}</span></div>
        <div class="detail-item"><span class="dl">RAM</span><span>{{ detailDevice()!.ram_total_gb || '?' }} GB</span></div>
        <div class="detail-item"><span class="dl">Disco</span><span>{{ detailDevice()!.disk_total_gb || '?' }} GB</span></div>
        <div class="detail-item"><span class="dl">Versao</span><span>{{ detailDevice()!.software_version || '—' }}</span></div>
        <div class="detail-item"><span class="dl">Uptime</span><span>{{ fmtUptime(detailDevice()!.uptime_seconds) }}</span></div>
        <div class="detail-item"><span class="dl">IP publico</span><code>{{ detailDevice()!.ip_address || '—' }}</code></div>
        <div class="detail-item"><span class="dl">IP local</span><code>{{ detailDevice()!.local_ip || '—' }}</code></div>
        <div class="detail-item"><span class="dl">Cameras</span><span>{{ detailDevice()!.cameras_active }} ativas de {{ detailDevice()!.cameras_total }}</span></div>
        <div class="detail-item"><span class="dl">Ultimo heartbeat</span><span>{{ detailDevice()!.last_heartbeat ? fmtDate(detailDevice()!.last_heartbeat) : 'Nunca' }}</span></div>
        <div class="detail-item"><span class="dl">Ultimo sync</span><span>{{ detailDevice()!.last_sync ? fmtDate(detailDevice()!.last_sync) : 'Nunca' }}</span></div>
      </div>

      <div class="modal-footer">
        <button class="btn sm" style="color:var(--critical)" (click)="detailDevice.set(null)">Fechar</button>
      </div>
    </div>
  </div>
}

<!-- Logs modal -->
@if (logsDevice()) {
  <div class="modal-backdrop" (click)="logsDevice.set(null)">
    <div class="modal" style="max-width:700px;height:70vh;display:flex;flex-direction:column" (click)="$event.stopPropagation()">
      <div class="modal-header" style="flex-shrink:0">
        <h3>Logs — {{ logsDevice()!.name }}</h3>
        <button class="btn ghost sm" (click)="logsDevice.set(null)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>
      <div class="logs-body" style="flex:1;overflow-y:auto">
        @if (deviceLogs().length === 0) {
          <div style="text-align:center;padding:40px;color:var(--hint);font-size:13px">Nenhum log registrado</div>
        }
        @for (log of deviceLogs(); track log.id) {
          <div class="log-line">
            <span class="log-time">{{ fmtDate(log.created_at) }}</span>
            <span class="log-badge" [class]="'lb-'+log.level">{{ log.level }}</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        }
      </div>
      <div class="modal-footer" style="flex-shrink:0">
        <span style="font-size:12px;color:var(--hint)">{{ deviceLogs().length }} entradas</span>
        <button class="btn sm primary" (click)="logsDevice.set(null)">Fechar</button>
      </div>
    </div>
  </div>
}

<!-- Provision modal -->
@if (showProvision()) {
  <div class="modal-backdrop" (click)="showProvision.set(false)">
    <div class="modal" style="max-width:600px" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3>Provisionar edge device</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Gera o comando de instalacao para o mini PC do cliente</p>
        </div>
        <button class="btn ghost sm" (click)="showProvision.set(false)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>

      <div class="form-group">
        <label>Tenant (cliente)</label>
        <select [(ngModel)]="provForm.tenant_id">
          <option [ngValue]="null">Selecione o cliente...</option>
          @for (t of tenants(); track t.id) {
            <option [ngValue]="t.id">{{ t.company_name }}</option>
          }
        </select>
      </div>
      <div class="form-group">
        <label>Nome do device</label>
        <input [(ngModel)]="provForm.name" placeholder="Ex: Mini PC Loja Centro"/>
      </div>

      @if (provResult()) {
        <div class="provision-result">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--primary)">Device registrado!</div>
          <div class="detail-item"><span class="dl">Device ID</span><code>{{ provResult()!.device_id }}</code></div>
          <div class="detail-item"><span class="dl">API Key</span><code style="font-size:11px;word-break:break-all">{{ provResult()!.api_key }}</code></div>
          <div style="margin-top:12px;font-size:12px;font-weight:500">Comando de instalacao:</div>
          <div class="cmd-box" (click)="copyCmd()">
            <code>bash setup.sh --central {{ centralUrl }} --tenant-id {{ provForm.tenant_id }} --name "{{ provForm.name }}"</code>
            <span class="copy-hint">{{ copied() ? 'Copiado!' : 'Clique pra copiar' }}</span>
          </div>
        </div>
      } @else {
        <div class="modal-footer">
          <button class="btn" (click)="showProvision.set(false)">Cancelar</button>
          <button class="btn primary" (click)="provision()" [disabled]="provisioning() || !provForm.tenant_id || !provForm.name">
            @if (provisioning()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
            {{ provisioning() ? 'Registrando...' : 'Provisionar' }}
          </button>
        </div>
      }
    </div>
  </div>
}
`, styles:[`
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;text-align:center}
.kpi-val{font-size:36px;font-weight:800;letter-spacing:-1.5px;line-height:1}
.kpi-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-top:6px}

.device-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.device-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;box-shadow:var(--shadow-sm);transition:all .2s;&:hover{box-shadow:var(--shadow);transform:translateY(-1px)}}
.device-online{border-left:3px solid var(--primary)}
.device-offline{border-left:3px solid #cbd5e1;opacity:.85}
.device-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.device-status{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
.status-dot{width:8px;height:8px;border-radius:50%}
.dot-on{background:var(--primary);animation:blink 2s infinite}
.dot-off{background:#cbd5e1}
.status-text{text-transform:uppercase;letter-spacing:.5px;font-size:11px}
.device-version{font-size:11px;color:var(--hint);font-family:monospace;background:var(--bg);padding:2px 8px;border-radius:4px}
.device-name{font-size:15px;font-weight:700;margin-bottom:2px}
.device-tenant{font-size:12px;color:var(--muted);margin-bottom:10px}
.device-specs{display:flex;gap:12px;margin-bottom:10px}
.spec{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);background:var(--bg);padding:4px 10px;border-radius:6px}
.device-metrics{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
.metric-bar{display:flex;align-items:center;gap:8px;font-size:11px}
.metric-label{width:28px;color:var(--muted);font-weight:600}
.bar-track{flex:1;height:6px;background:var(--bg);border-radius:3px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;background:var(--primary);transition:width .5s}
.bar-warn{background:var(--high)!important}
.bar-crit{background:var(--critical)!important}
.metric-val{width:32px;text-align:right;font-weight:500;color:var(--muted)}
.device-footer{display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border)}
.device-seen{font-size:11px;color:var(--hint)}
.device-actions{display:flex;gap:4px}
.da-btn{width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);transition:all .15s;&:hover{background:var(--bg);color:var(--text);transform:scale(1.08)}}
.da-logs{&:hover{background:#f3e8ff;color:#7c3aed;border-color:#c4b5fd}}

.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.detail-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;gap:8px}
.detail-item:last-child{border:none}
.dl{color:var(--muted);flex-shrink:0}
.detail-item code{font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px;word-break:break-all}
.tag-status{padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600}
.tag-on{background:#dcfce7;color:#166534}
.tag-off{background:#f1f5f9;color:#64748b}

.logs-body{font-family:monospace;font-size:12px;background:#0d1117;margin:0 -28px;padding:12px 28px;color:#e2e8f0}
.log-line{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.log-time{color:#64748b;flex-shrink:0;font-size:11px}
.log-badge{padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;flex-shrink:0;text-transform:uppercase}
.lb-info{background:#1e3a5f;color:#7dd3fc}
.lb-warning{background:#422006;color:#fbbf24}
.lb-error{background:#4c0519;color:#fda4af}
.lb-critical{background:#450a0a;color:#fca5a5}
.log-msg{word-break:break-all}

.provision-result{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:16px;margin-top:8px}
.cmd-box{background:#0d1117;color:#e2e8f0;padding:12px 16px;border-radius:8px;font-family:monospace;font-size:12px;margin-top:8px;cursor:pointer;position:relative;word-break:break-all;line-height:1.6;&:hover{background:#161b22}}
.copy-hint{display:block;text-align:right;font-size:10px;color:#64748b;margin-top:4px}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
`]})
export class AdminFleetComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private interval: any = null;

  devices = signal<any[]>([]);
  tenants = signal<any[]>([]);
  loading = signal(true);

  detailDevice = signal<any>(null);
  logsDevice = signal<any>(null);
  deviceLogs = signal<any[]>([]);

  showProvision = signal(false);
  provisioning = signal(false);
  provResult = signal<any>(null);
  copied = signal(false);
  provForm: any = { tenant_id: null, name: '' };
  centralUrl = window.location.origin;

  stats = computed(() => {
    const d = this.devices();
    return {
      total: d.length,
      online: d.filter(x => x.is_online).length,
      offline: d.filter(x => !x.is_online).length,
      cameras: d.reduce((sum, x) => sum + (x.cameras_active || 0), 0),
    };
  });

  ngOnInit() {
    this.load();
    this.interval = setInterval(() => this.load(), 15000);
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  load() {
    this.api.getFleetDevices().subscribe({
      next: (d: any) => {
        this.devices.set(Array.isArray(d) ? d : (d.results ?? []));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  openProvision() {
    this.provForm = { tenant_id: null, name: '' };
    this.provResult.set(null);
    this.showProvision.set(true);
    this.api.adminTenants({ page_size: '100' }).subscribe((r: any) => {
      this.tenants.set(Array.isArray(r) ? r : (r.results ?? []));
    });
  }

  provision() {
    if (!this.provForm.tenant_id || !this.provForm.name) return;
    this.provisioning.set(true);
    this.api.provisionDevice(this.provForm).subscribe({
      next: (r: any) => {
        this.provResult.set(r);
        this.provisioning.set(false);
        this.load();
      },
      error: () => this.provisioning.set(false)
    });
  }

  copyCmd() {
    const cmd = `bash setup.sh --central ${this.centralUrl} --tenant-id ${this.provForm.tenant_id} --name "${this.provForm.name}"`;
    navigator.clipboard.writeText(cmd);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  openDetail(d: any) { this.detailDevice.set(d); }

  openLogs(d: any) {
    this.logsDevice.set(d);
    this.deviceLogs.set([]);
    this.api.getDeviceLogs(d.id).subscribe((r: any) => {
      this.deviceLogs.set(Array.isArray(r) ? r : (r.results ?? []));
    });
  }

  fmtRelative(d: string) {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `ha ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `ha ${Math.floor(diff / 3600)}h`;
    return `ha ${Math.floor(diff / 86400)}d`;
  }

  fmtDate(d: string) {
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  fmtUptime(seconds: number) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}min`;
  }
}
