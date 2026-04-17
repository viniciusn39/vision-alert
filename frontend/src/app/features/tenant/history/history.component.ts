import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { Alert } from "../../../core/models/models";

@Component({ selector:"app-history", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Histórico de Alertas</h1>
      <p class="page-sub">{{ total() }} alertas registrados</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="filter-sel" [(ngModel)]="fStatus" (ngModelChange)="resetAndLoad()">
        <option value="">Todos os status</option>
        <option value="open">Abertos</option>
        <option value="acknowledged">Reconhecidos</option>
        <option value="resolved">Resolvidos</option>
      </select>
      <select class="filter-sel" [(ngModel)]="fSeverity" (ngModelChange)="resetAndLoad()">
        <option value="">Toda severidade</option>
        <option value="critical">🔴 Crítico</option>
        <option value="high">🟠 Alto</option>
        <option value="medium">🔵 Médio</option>
        <option value="low">🟢 Baixo</option>
      </select>
      @if (fStatus || fSeverity) {
        <button class="btn sm ghost" (click)="clearFilters()" style="color:var(--muted)">Limpar</button>
      }
    </div>
  </div>

  <!-- Summary pills -->
  <div class="summary-row">
    <div class="sum-pill sum-open">
      <span class="sum-val">{{ countByStatus('open') }}</span>
      <span class="sum-lbl">Abertos</span>
    </div>
    <div class="sum-pill sum-ack">
      <span class="sum-val">{{ countByStatus('acknowledged') }}</span>
      <span class="sum-lbl">Reconhecidos</span>
    </div>
    <div class="sum-pill sum-resolved">
      <span class="sum-val">{{ countByStatus('resolved') }}</span>
      <span class="sum-lbl">Resolvidos</span>
    </div>
    <div class="sum-pill sum-critical">
      <span class="sum-val">{{ countBySeverity('critical') }}</span>
      <span class="sum-lbl">Críticos</span>
    </div>
  </div>

  @if (loading()) {
    <div class="loading"><div class="spinner"></div></div>
  } @else if (alerts().length === 0) {
    <div class="empty">
      <div class="empty-icon">✅</div>
      <h4>Nenhum alerta encontrado</h4>
      <p>Ajuste os filtros para ver outros registros</p>
    </div>
  } @else {
    <div class="table-card">
      <table class="dt">
        <thead>
          <tr>
            <th style="width:130px">Data/Hora</th>
            <th>Regra</th>
            <th>Câmera</th>
            <th style="width:100px">Severidade</th>
            <th style="width:120px">Status</th>
            <th style="width:80px;text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (a of alerts(); track a.id) {
            <tr class="alert-row" [class.row-open]="a.status==='open'" (click)="openDetail(a)">
              <td>
                <div style="font-size:12px;font-weight:500;white-space:nowrap">{{ fmtDate(a.triggered_at) }}</div>
                <div style="font-size:10px;color:var(--hint)">{{ timeAgo(a.triggered_at) }}</div>
              </td>
              <td>
                <div style="font-weight:600;font-size:13px">{{ a.rule_name }}</div>
                <div style="font-size:11px;color:var(--muted)">{{ a.description }}</div>
              </td>
              <td>
                <div style="font-size:13px">{{ a.camera_name }}</div>
                <div style="font-size:11px;color:var(--muted)">{{ a.camera_location }}</div>
              </td>
              <td>
                <span [class]="'badge '+a.rule_severity">{{ sevLabel(a.rule_severity) }}</span>
              </td>
              <td>
                <div class="status-cell">
                  <span class="status-dot" [class]="'sdot-'+a.status"></span>
                  <span [class]="'badge '+a.status">{{ statLabel(a.status) }}</span>
                </div>
              </td>
              <td style="text-align:right" (click)="$event.stopPropagation()">
                <div style="display:inline-flex;gap:4px">
                  @if (a.status === 'open') {
                    <button class="act-btn act-ack" (click)="ack(a)" title="Reconhecer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                    </button>
                  }
                  @if (a.status !== 'resolved') {
                    <button class="act-btn act-resolve" (click)="resolve(a)" title="Resolver">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12,8 12,12 14,14"/></svg>
                    </button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (totalPages() > 1) {
      <div class="pagination">
        <button class="btn sm" (click)="changePage(page()-1)" [disabled]="page()===1">← Anterior</button>
        <div class="page-nums">
          @for (p of pageRange(); track p) {
            <button class="page-btn" [class.active]="p===page()" (click)="changePage(p)">{{ p }}</button>
          }
        </div>
        <button class="btn sm" (click)="changePage(page()+1)" [disabled]="page()===totalPages()">Próxima →</button>
      </div>
    }
  }
</div>

<!-- Detail side panel -->
@if (selected()) {
  <div class="panel-backdrop" (click)="selected.set(null)">
    <div class="detail-panel" (click)="$event.stopPropagation()">

      <!-- Panel header -->
      <div class="panel-header">
        <div class="panel-title-row">
          <span [class]="'badge '+selected()!.rule_severity" style="font-size:12px">{{ sevLabel(selected()!.rule_severity) }}</span>
          <span [class]="'badge '+selected()!.status" style="font-size:12px">{{ statLabel(selected()!.status) }}</span>
        </div>
        <button class="btn ghost sm" (click)="selected.set(null)" style="font-size:18px;padding:4px 8px;flex-shrink:0">✕</button>
      </div>

      <div class="panel-body">
        <h2 class="panel-rule-name">{{ selected()!.rule_name }}</h2>
        <p class="panel-desc">{{ selected()!.description }}</p>

        <!-- Snapshot -->
        @if (selected()!.snapshot_url) {
          <div class="panel-snapshot" (click)="lightbox.set(selected()!.snapshot_url!)">
            <img [src]="selected()!.snapshot_url" style="width:100%;border-radius:8px;display:block;cursor:zoom-in"/>
            <div class="snap-overlay">🔍 Ampliar</div>
          </div>
        } @else {
          <div class="no-snapshot">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
            Sem snapshot disponível
          </div>
        }

        <!-- Info grid -->
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">📷 Câmera</div>
            <div class="info-val">{{ selected()!.camera_name }}</div>
            <div class="info-sub">{{ selected()!.camera_location }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">🕐 Disparado em</div>
            <div class="info-val">{{ fmtDateFull(selected()!.triggered_at) }}</div>
            <div class="info-sub">{{ timeAgo(selected()!.triggered_at) }}</div>
          </div>
          @if (selected()!.resolved_at) {
            <div class="info-item">
              <div class="info-label">✅ Resolvido em</div>
              <div class="info-val">{{ fmtDateFull(selected()!.resolved_at!) }}</div>
              <div class="info-sub">Duração: {{ duration(selected()!.triggered_at, selected()!.resolved_at!) }}</div>
            </div>
          }
          @if (selected()!.detection_data && objKeys(selected()!.detection_data).length > 0) {
            <div class="info-item" style="grid-column:1/-1">
              <div class="info-label">📊 Dados da detecção</div>
              <div class="detection-data">
                @for (key of objKeys(selected()!.detection_data); track key) {
                  <div class="det-row">
                    <span class="det-key">{{ key }}</span>
                    <span class="det-val">{{ selected()!.detection_data[key] }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Actions -->
        @if (selected()!.status !== 'resolved') {
          <div class="panel-actions">
            @if (selected()!.status === 'open') {
              <button class="btn" style="flex:1;justify-content:center" (click)="ackSelected()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                Reconhecer
              </button>
            }
            <button class="btn primary" style="flex:1;justify-content:center" (click)="resolveSelected()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12,8 12,12 14,14"/></svg>
              Marcar resolvido
            </button>
          </div>
        } @else {
          <div style="text-align:center;padding:16px;font-size:13px;color:var(--muted)">
            ✅ Este alerta foi resolvido
          </div>
        }
      </div>
    </div>
  </div>
}

<!-- Lightbox -->
@if (lightbox()) {
  <div class="modal-backdrop" style="z-index:2000" (click)="lightbox.set(null)">
    <img [src]="lightbox()!" style="max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)"/>
  </div>
}
`, styles:[`
.filter-sel{padding:8px 12px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;background:var(--surface);outline:none;cursor:pointer;&:focus{border-color:var(--primary)}}

/* Summary */
.summary-row{display:flex;gap:10px}
.sum-pill{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 18px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow-sm)}
.sum-val{font-size:20px;font-weight:800;letter-spacing:-1px}
.sum-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.sum-open .sum-val{color:var(--critical)}
.sum-ack .sum-val{color:var(--high)}
.sum-resolved .sum-val{color:var(--primary)}
.sum-critical .sum-val{color:var(--critical)}

/* Table */
.alert-row{cursor:pointer;transition:background .12s}
.alert-row:hover td{background:#f0fdf4 !important}
.alert-row.row-open td{border-left:0}
.alert-row.row-open:first-child td:first-child{border-left:3px solid var(--critical)}
.status-cell{display:flex;align-items:center;gap:6px}
.status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.sdot-open{background:var(--critical);animation:blink 1.5s infinite}
.sdot-acknowledged{background:var(--high)}
.sdot-resolved{background:var(--primary)}
.act-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;&:hover{transform:scale(1.08)}}
.act-ack{color:var(--medium);&:hover{background:var(--medium-bg)}}
.act-resolve{color:var(--primary);&:hover{background:var(--primary-light)}}

/* Pagination */
.pagination{display:flex;align-items:center;justify-content:center;gap:8px}
.page-nums{display:flex;gap:4px}
.page-btn{width:32px;height:32px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:12px;cursor:pointer;transition:all .15s;&:hover{background:var(--bg)}&.active{background:var(--primary);color:#fff;border-color:var(--primary)}}

/* Side panel */
.panel-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.4);backdrop-filter:blur(2px);z-index:900;display:flex;justify-content:flex-end}
.detail-panel{width:420px;height:100vh;background:var(--surface);box-shadow:-8px 0 40px rgba(0,0,0,.15);display:flex;flex-direction:column;animation:slideRight .25s ease}
@keyframes slideRight{from{transform:translateX(100%);opacity:0}to{transform:none;opacity:1}}
.panel-header{padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.panel-title-row{display:flex;gap:8px;align-items:center}
.panel-body{flex:1;overflow-y:auto;padding:20px}
.panel-rule-name{font-size:18px;font-weight:700;letter-spacing:-.3px;margin-bottom:6px}
.panel-desc{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:18px}
.panel-snapshot{position:relative;margin-bottom:18px;border-radius:8px;overflow:hidden;border:1px solid var(--border);&:hover .snap-overlay{opacity:1}}
.snap-overlay{position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:500;opacity:0;transition:opacity .2s;cursor:zoom-in}
.no-snapshot{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:24px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:13px;color:var(--hint);margin-bottom:18px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.info-item{background:#f8fafc;border-radius:8px;padding:12px 14px}
.info-label{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.info-val{font-size:13px;font-weight:600;color:var(--text)}
.info-sub{font-size:11px;color:var(--muted);margin-top:2px}
.detection-data{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.det-row{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);&:last-child{border:none}}
.det-key{color:var(--muted);font-weight:500}
.det-val{font-weight:600}
.panel-actions{display:flex;gap:8px;padding:16px 0 0;border-top:1px solid var(--border)}
`]})
export class HistoryComponent implements OnInit {
  private api = inject(ApiService);
  alerts   = signal<Alert[]>([]);
  loading  = signal(true);
  total    = signal(0);
  page     = signal(1);
  pageSize = 20;
  fStatus  = "";
  fSeverity = "";
  selected  = signal<Alert|null>(null);
  lightbox  = signal<string|null>(null);

  totalPages() { return Math.ceil(this.total() / this.pageSize) || 1; }
  countByStatus(s: string)   { return this.alerts().filter(a => a.status === s).length; }
  countBySeverity(s: string) { return this.alerts().filter(a => a.rule_severity === s).length; }

  pageRange() {
    const total = this.totalPages();
    const cur   = this.page();
    const start = Math.max(1, cur - 2);
    const end   = Math.min(total, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const p: any = { page: String(this.page()), page_size: String(this.pageSize), ordering: "-triggered_at" };
    if (this.fStatus)   p.status   = this.fStatus;
    if (this.fSeverity) p.severity = this.fSeverity;
    this.api.getAlerts(p).subscribe(r => {
      this.alerts.set(r.results ?? r);
      this.total.set(r.count ?? (r.results ?? r).length);
      this.loading.set(false);
    });
  }

  resetAndLoad() { this.page.set(1); this.load(); }
  clearFilters() { this.fStatus = ""; this.fSeverity = ""; this.resetAndLoad(); }
  changePage(p: number) { if (p < 1 || p > this.totalPages()) return; this.page.set(p); this.load(); }

  openDetail(a: Alert) { this.selected.set(a); }

  ack(a: Alert) {
    this.api.acknowledgeAlert(a.id).subscribe(() => {
      const updated = { ...a, status: "acknowledged" as const };
      this.alerts.update(as => as.map(x => x.id === a.id ? updated : x));
      if (this.selected()?.id === a.id) this.selected.set(updated);
    });
  }

  resolve(a: Alert) {
    this.api.resolveAlert(a.id).subscribe(() => {
      const updated = { ...a, status: "resolved" as const };
      this.alerts.update(as => as.map(x => x.id === a.id ? updated : x));
      if (this.selected()?.id === a.id) this.selected.set(updated);
    });
  }

  ackSelected()     { if (this.selected()) this.ack(this.selected()!); }
  resolveSelected() { if (this.selected()) this.resolve(this.selected()!); }

  objKeys(obj: any): string[] { return obj ? Object.keys(obj) : []; }

  sevLabel(s: string)  { return ({critical:"Crítico",high:"Alto",medium:"Médio",low:"Baixo"} as any)[s] ?? s; }
  statLabel(s: string) { return ({open:"Aberto",acknowledged:"Reconhecido",resolved:"Resolvido"} as any)[s] ?? s; }

  fmtDate(d: string) {
    return new Date(d).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
  }
  fmtDateFull(d: string) {
    return new Date(d).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  }
  timeAgo(d: string) {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60)    return "agora";
    if (diff < 3600)  return `há ${Math.floor(diff/60)}min`;
    if (diff < 86400) return `há ${Math.floor(diff/3600)}h`;
    return `há ${Math.floor(diff/86400)}d`;
  }
  duration(start: string, end: string) {
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff/60)}min`;
    return `${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}min`;
  }
}
