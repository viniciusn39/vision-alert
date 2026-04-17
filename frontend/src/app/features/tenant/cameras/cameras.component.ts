import { Component, inject, OnInit, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { Camera } from "../../../core/models/models";

@Component({ selector:"app-cameras", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Câmeras</h1>
      <p class="page-sub">{{ filtered().length }} de {{ cameras().length }} câmera{{ cameras().length !== 1 ? 's' : '' }}</p>
    </div>
    <button class="btn primary" (click)="openModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Adicionar câmera
    </button>
  </div>

  <!-- Stat cards -->
  <div class="stat-row">
    <div class="stat-card stat-online" [class.stat-active]="filterStatus()==='online'" (click)="toggleFilter('online')" style="cursor:pointer">
      <div class="stat-val">{{ countByStatus('online') }}</div>
      <div class="stat-label">Online</div>
      <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg></div>
    </div>
    <div class="stat-card stat-offline" [class.stat-active]="filterStatus()==='offline'" (click)="toggleFilter('offline')" style="cursor:pointer">
      <div class="stat-val">{{ countByStatus('offline') }}</div>
      <div class="stat-label">Offline</div>
      <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="1" x2="23" y2="23"/><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg></div>
    </div>
    <div class="stat-card stat-alert" [class.stat-active]="filterStatus()==='alert'" (click)="toggleFilter('alert')" style="cursor:pointer">
      <div class="stat-val">{{ countByStatus('alert') }}</div>
      <div class="stat-label">Em alerta</div>
      <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
    </div>
  </div>

  <!-- Toolbar: search + filters + view toggle -->
  <div class="toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Buscar por nome, localização ou URL..." />
      @if (search()) { <button class="clear-btn" (click)="search.set('')">✕</button> }
    </div>

    <select class="filter-select" [ngModel]="filterProtocol()" (ngModelChange)="filterProtocol.set($event)">
      <option value="">Todos os protocolos</option>
      <option value="rtsp">RTSP</option>
      <option value="http">HTTP</option>
      <option value="local">Webcam</option>
      <option value="file">Arquivo</option>
      <option value="youtube">YouTube</option>
    </select>

    @if (filterStatus() || search() || filterProtocol()) {
      <button class="btn sm ghost" (click)="clearFilters()" style="color:var(--muted)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Limpar filtros
      </button>
    }

    <div class="view-toggle">
      <button class="view-btn" [class.active]="view()==='grid'" (click)="view.set('grid')" title="Grade">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
      </button>
      <button class="view-btn" [class.active]="view()==='table'" (click)="view.set('table')" title="Tabela">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </div>

  <!-- Empty state -->
  @if (filtered().length === 0 && !loading()) {
    <div class="empty">
      <div class="empty-icon">{{ cameras().length === 0 ? '📷' : '🔍' }}</div>
      <h4>{{ cameras().length === 0 ? 'Nenhuma câmera configurada' : 'Nenhum resultado' }}</h4>
      <p>{{ cameras().length === 0 ? 'Adicione câmeras para iniciar o monitoramento' : 'Tente ajustar os filtros de busca' }}</p>
      @if (cameras().length === 0) { <button class="btn primary" style="margin-top:20px" (click)="openModal()">+ Adicionar câmera</button> }
    </div>
  }

  <!-- GRID VIEW -->
  @if (view() === 'grid' && filtered().length > 0) {
    <div class="cam-grid">
      @for (cam of filtered(); track cam.id) {
        <div class="cam-card" [class.cam-online]="cam.status==='online'" [class.cam-alert]="cam.status==='alert'">
          <div class="cam-preview">
            @if (cam.snapshot_url) {
              <img [src]="cam.snapshot_url" style="width:100%;height:100%;object-fit:cover"/>
            } @else {
              <div class="cam-no-feed">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.5"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
                <span>Sem sinal</span>
              </div>
            }
            <div class="cam-status-pill" [class]="'cpill-'+cam.status">
              <span class="cpill-dot"></span>{{ cam.status }}
            </div>
            <div class="cam-proto-pill">{{ cam.protocol?.toUpperCase() }}</div>
          </div>
          <div class="cam-body">
            <div class="cam-name">{{ cam.name }}</div>
            <div class="cam-loc">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {{ cam.location }}
            </div>
            <div class="cam-url" title="{{ cam.url }}">{{ cam.url }}</div>
          </div>
          <div class="cam-footer">
            <span class="cam-seen">{{ cam.last_seen ? fmtRelative(cam.last_seen) : 'Nunca visto' }}</span>
            <div class="cam-actions">
              @if (cam.is_active) {
                <button class="ca-btn ca-stop" (click)="confirmStop(cam)" title="Parar"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>
              } @else {
                <button class="ca-btn ca-start" (click)="start(cam)" title="Iniciar"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>
              }
              <button class="ca-btn ca-live" (click)="openLive(cam)" title="Ver análise ao vivo">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 014 4v1h1a3 3 0 010 6h-1v1a4 4 0 01-8 0v-1H7a3 3 0 010-6h1V6a4 4 0 014-4z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9 14s1 1 3 1 3-1 3-1"/></svg>
              </button>
              <button class="ca-btn ca-logs" (click)="openLogs(cam)" title="Logs em tempo real"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg></button>
              <button class="ca-btn ca-dash" (click)="openDash(cam)" title="Dashboard da câmera"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="1" width="9" height="9" rx="1"/><rect x="14" y="1" width="9" height="9" rx="1"/><rect x="14" y="14" width="9" height="9" rx="1"/><rect x="1" y="14" width="9" height="9" rx="1"/></svg></button>
              <button class="ca-btn ca-edit" (click)="openModal(cam)" title="Editar"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="ca-btn ca-delete" (click)="confirmDelete(cam)" title="Excluir"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
            </div>
          </div>
        </div>
      }
    </div>
  }

  <!-- TABLE VIEW -->
  @if (view() === 'table' && filtered().length > 0) {
    <div class="table-card">
      <table class="dt">
        <thead>
          <tr>
            <th>Câmera</th>
            <th>URL</th>
            <th>Protocolo</th>
            <th>Status</th>
            <th>Último contato</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (cam of filtered(); track cam.id) {
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="table-cam-dot" [class]="'tcd-'+cam.status"></div>
                  <div>
                    <div style="font-weight:600;font-size:13px">{{ cam.name }}</div>
                    <div style="font-size:11px;color:var(--muted)">{{ cam.location }}</div>
                  </div>
                </div>
              </td>
              <td><code style="font-size:11px;background:#f1f5f9;padding:3px 7px;border-radius:5px;color:var(--muted)">{{ truncUrl(cam.url) }}</code></td>
              <td><span class="badge medium">{{ cam.protocol?.toUpperCase() }}</span></td>
              <td><span [class]="'badge '+cam.status">{{ cam.status }}</span></td>
              <td style="font-size:12px;color:var(--muted)">{{ cam.last_seen ? fmtDate(cam.last_seen) : '—' }}</td>
              <td style="text-align:right">
                <div style="display:inline-flex;gap:5px;align-items:center;justify-content:flex-end">
                  @if (cam.is_active) {
                    <button class="tbl-btn tbl-stop" (click)="confirmStop(cam)" title="Parar monitoramento">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                      Parar
                    </button>
                  } @else {
                    <button class="tbl-btn tbl-start" (click)="start(cam)" title="Iniciar monitoramento">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                      Iniciar
                    </button>
                  }
                  <button class="tbl-btn tbl-live" (click)="openLive(cam)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 014 4v1h1a3 3 0 010 6h-1v1a4 4 0 01-8 0v-1H7a3 3 0 010-6h1V6a4 4 0 014-4z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>
                    Análise
                  </button>
                  <button class="tbl-btn tbl-logs" (click)="openLogs(cam)" title="Logs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    Logs
                  </button>
                  <button class="tbl-btn tbl-dash" (click)="openDash(cam)" title="Dashboard">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="1" width="9" height="9" rx="1"/><rect x="14" y="1" width="9" height="9" rx="1"/><rect x="14" y="14" width="9" height="9" rx="1"/><rect x="1" y="14" width="9" height="9" rx="1"/></svg>
                    Dashboard
                  </button>
                  <button class="tbl-btn tbl-edit" (click)="openModal(cam)" title="Editar">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editar
                  </button>
                  <button class="tbl-icon tbl-del" (click)="confirmDelete(cam)" title="Excluir">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</div>

<!-- Logs Modal -->
@if (logsCamera()) {
  <div class="modal-backdrop" (click)="closeLogs()">
    <div class="modal" style="max-width:720px;height:80vh;display:flex;flex-direction:column" (click)="$event.stopPropagation()">
      <div class="modal-header" style="flex-shrink:0">
        <div>
          <h3>Logs — {{ logsCamera()!.name }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Processamento em tempo real</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="live-dot" [class.live-active]="logsCamera()!.is_active"></div>
          <span style="font-size:12px;color:var(--muted)">{{ logsCamera()!.is_active ? 'Processando' : 'Parado' }}</span>
          <button class="btn ghost sm" (click)="closeLogs()" style="font-size:16px;padding:4px 8px">✕</button>
        </div>
      </div>
      <div class="logs-toolbar" style="flex-shrink:0">
        <div class="log-level-tabs">
          <button class="llt" [class.llt-active]="logsLevel()==='all'" (click)="logsLevel.set('all')">Todos</button>
          <button class="llt llt-detect" [class.llt-active]="logsLevel()==='detect'" (click)="logsLevel.set('detect')">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>Detecções
          </button>
          <button class="llt llt-alert" [class.llt-active]="logsLevel()==='alert'" (click)="logsLevel.set('alert')">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,22 2,22"/></svg>Alertas
          </button>
        </div>
        <div class="search-box" style="flex:1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input [(ngModel)]="logsFilter" placeholder="Buscar nos logs..."/>
          @if (logsFilter) { <button class="clear-btn" (click)="logsFilter=''">✕</button> }
        </div>
        <label class="log-autoscroll">
          <input type="checkbox" [checked]="autoScroll()" (change)="autoScroll.set($any($event.target).checked)"/>
          Auto-scroll
        </label>
        <button class="btn sm ghost" (click)="clearLogs()" style="color:var(--muted);padding:5px 10px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
      <div class="logs-body" #logsBody>
        @if (filteredLogs().length === 0) {
          <div style="text-align:center;padding:40px;color:var(--hint);font-size:13px">
            {{ logsCamera()!.is_active ? 'Aguardando processamento...' : 'Câmera parada. Inicie para ver logs.' }}
          </div>
        }
        @for (log of filteredLogs(); track log.id) {
          <div class="log-line" [class]="'log-'+log.type">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-badge" [class]="'lb-'+log.type">{{ logTypeLabel(log.type) }}</span>
            <span class="log-msg">{{ log.msg }}</span>
          </div>
        }
      </div>
      <div class="modal-footer" style="flex-shrink:0;border-top:1px solid var(--border);padding-top:12px">
        <span style="font-size:12px;color:var(--hint)">{{ filteredLogs().length }} entradas</span>
        <button class="btn sm primary" (click)="closeLogs()">Fechar</button>
      </div>
    </div>
  </div>
}

<!-- Dashboard Modal -->
@if (dashCamera()) {
  <div class="modal-backdrop" (click)="dashCamera.set(null)">
    <div class="modal" style="max-width:800px" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3>{{ dashCamera()!.name }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">{{ dashCamera()!.location }} · {{ dashCamera()!.protocol?.toUpperCase() }}</p>
        </div>
        <button class="btn ghost sm" (click)="dashCamera.set(null)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>

      @if (dashLoading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else {
        <!-- KPI row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
          <div class="dash-kpi">
            <div class="dk-val" style="color:var(--critical)">{{ dashStats().total }}</div>
            <div class="dk-label">Total alertas</div>
          </div>
          <div class="dash-kpi">
            <div class="dk-val" style="color:var(--critical)">{{ dashStats().open }}</div>
            <div class="dk-label">Em aberto</div>
          </div>
          <div class="dash-kpi">
            <div class="dk-val" style="color:var(--high)">{{ dashStats().critical }}</div>
            <div class="dk-label">Críticos</div>
          </div>
          <div class="dash-kpi">
            <div class="dk-val" style="color:var(--primary)">{{ dashStats().resolved }}</div>
            <div class="dk-label">Resolvidos</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <!-- Rules applied -->
          <div>
            <div style="font-size:13px;font-weight:600;margin-bottom:8px">Regras aplicadas ({{ dashDetail()?.rules?.length || 0 }})</div>
            @if (!dashDetail()?.rules?.length) {
              <div style="padding:16px;text-align:center;font-size:12px;color:var(--muted);background:var(--bg);border-radius:var(--r-sm)">Nenhuma regra associada a esta câmera</div>
            } @else {
              <div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto">
                @for (r of dashDetail()!.rules; track r.id) {
                  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
                    <div style="width:6px;height:6px;border-radius:50%;flex-shrink:0" [style.background]="sevColor(r.severity)"></div>
                    <div style="flex:1;font-size:12px;font-weight:500">{{ r.name }}</div>
                    <span style="font-size:10px;color:var(--muted)">{{ r.cooldown_seconds }}s cooldown</span>
                    <div style="width:6px;height:6px;border-radius:50%" [style.background]="r.is_active ? 'var(--primary)' : '#cbd5e1'"></div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Metrics -->
          <div>
            <div style="font-size:13px;font-weight:600;margin-bottom:8px">Métricas — 24h</div>
            @if (!dashDetail()?.metrics || !objectKeys(dashDetail()!.metrics).length) {
              <div style="padding:16px;text-align:center;font-size:12px;color:var(--muted);background:var(--bg);border-radius:var(--r-sm)">Sem métricas registradas ainda</div>
            } @else {
              <div style="display:flex;flex-direction:column;gap:6px">
                @for (key of objectKeys(dashDetail()!.metrics); track key) {
                  <div style="padding:10px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                      <span style="font-weight:600;text-transform:capitalize">{{ metricLabel(key) }}</span>
                      <span style="color:var(--primary);font-weight:700">máx: {{ dashDetail()!.metrics[key].max }}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
                      <span>média: {{ dashDetail()!.metrics[key].avg }}</span>
                      <span>{{ dashDetail()!.metrics[key].count }} registros</span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Recent alerts -->
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">Últimos alertas</div>
        @if (!dashDetail()?.recent_alerts?.length) {
          <div class="empty" style="padding:16px"><div class="empty-icon">✅</div><p>Nenhum alerta recente</p></div>
        } @else {
          <div style="display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">
            @for (a of dashDetail()!.recent_alerts; track a.id) {
              <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
                <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0" [style.background]="sevColor(a['rule__severity'])"></div>
                <div style="flex:1">
                  <div style="font-size:12px;font-weight:600">{{ a['rule__name'] }}</div>
                  <div style="font-size:11px;color:var(--muted)">{{ a.description }}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <div style="font-size:10px;color:var(--muted)">{{ fmtDate(a.triggered_at) }}</div>
                  <span [class]="'badge '+a.status" style="font-size:10px">{{ a.status }}</span>
                </div>
              </div>
            }
          </div>
        }
      }

      <div class="modal-footer" style="border-top:1px solid var(--border);padding-top:12px;margin-top:16px">
        <span style="font-size:12px;color:var(--hint)">{{ dashDetail()?.recent_alerts?.length || 0 }} alertas · {{ dashDetail()?.rules?.length || 0 }} regras</span>
        <button class="btn sm primary" (click)="dashCamera.set(null)">Fechar</button>
      </div>
    </div>
  </div>
}

<!-- Live Stream Modal -->
@if (liveCamera()) {
  <div class="modal-backdrop" (click)="closeLive()">
    <div class="modal" style="max-width:760px;padding:0;overflow:hidden" (click)="$event.stopPropagation()">
      <div class="modal-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="live-dot live-active"></div>
          <div>
            <h3 style="margin:0">{{ liveCamera()!.name }}</h3>
            <p style="font-size:11px;color:var(--muted);margin:0">{{ liveCamera()!.location }} · ao vivo</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:99px;font-weight:600">IA AO VIVO</span>
          <button class="btn ghost sm" (click)="closeLive()" style="font-size:16px">✕</button>
        </div>
      </div>

      <div style="background:#000;position:relative;min-height:360px;display:flex;align-items:center;justify-content:center">
        @if (liveLoading()) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#fff">
            <div class="spinner" style="border-color:rgba(255,255,255,.2);border-top-color:#fff;width:32px;height:32px"></div>
            <span style="font-size:13px">Conectando ao stream...</span>
          </div>
        }
        @if (liveStreamUrl()) {
          <img [src]="liveStreamUrl()" style="width:100%;max-height:500px;object-fit:contain;display:block"
               (load)="liveLoading.set(false)"
               (error)="onLiveError()"/>
        }
        @if (liveError()) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:#fff;padding:40px">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.5"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
            <span style="font-size:13px;opacity:.6">Câmera offline ou sem sinal</span>
          </div>
        }
      </div>

      <div style="padding:12px 20px;background:var(--bg);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:16px;font-size:12px;color:var(--muted)">
          <span>🟢 Pessoas detectadas em verde</span>
          <span>🟡 Linha de contagem em amarelo</span>
        </div>
        <button class="btn sm primary" (click)="closeLive()">Fechar</button>
      </div>
    </div>
  </div>
}

<!-- Stop confirmation modal -->
@if (camToStop()) {
  <div class="modal-backdrop" (click)="camToStop.set(null)">
    <div class="modal" style="max-width:400px" (click)="$event.stopPropagation()">
      <div style="text-align:center;padding:8px 0 20px">
        <div style="width:56px;height:56px;border-radius:50%;background:#fffbeb;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--high)" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        </div>
        <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">Parar câmera?</h3>
        <p style="font-size:13px;color:var(--muted);line-height:1.5">
          Deseja parar o monitoramento de <strong>{{ camToStop()!.name }}</strong>?<br/>
          A câmera ficará offline até ser iniciada novamente.
        </p>
      </div>
      <div class="modal-footer" style="justify-content:center;gap:12px">
        <button class="btn" style="min-width:100px" (click)="camToStop.set(null)">Cancelar</button>
        <button class="btn" style="min-width:100px;background:#F59E0B;color:#fff;border-color:#F59E0B" (click)="stopConfirmed()">Parar monitoramento</button>
      </div>
    </div>
  </div>
}

<!-- Delete confirmation modal -->
@if (camToDelete()) {
  <div class="modal-backdrop" (click)="camToDelete.set(null)">
    <div class="modal" style="max-width:400px" (click)="$event.stopPropagation()">
      <div style="text-align:center;padding:8px 0 20px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--critical-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--critical)" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </div>
        <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">Excluir câmera?</h3>
        <p style="font-size:13px;color:var(--muted);line-height:1.5">
          Tem certeza que deseja excluir <strong>{{ camToDelete()!.name }}</strong>?<br/>
          Esta ação não pode ser desfeita.
        </p>
      </div>
      <div class="modal-footer" style="justify-content:center;gap:12px">
        <button class="btn" style="min-width:100px" (click)="camToDelete.set(null)">Cancelar</button>
        <button class="btn danger" style="min-width:100px" (click)="remove()">Sim, excluir</button>
      </div>
    </div>
  </div>
}

<!-- Modal -->
@if (showModal()) {
  <div class="modal-backdrop" (click)="closeModal($event)">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3>{{ editing() ? 'Editar câmera' : 'Nova câmera' }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">{{ editing() ? 'Altere as configurações' : 'Configure uma nova fonte de vídeo' }}</p>
        </div>
        <button class="btn ghost sm" (click)="showModal.set(false)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>
      <div class="row-2">
        <div class="form-group"><label>Nome *</label><input [(ngModel)]="form.name" placeholder="Ex: Câmera da Entrada"/></div>
        <div class="form-group"><label>Localização</label><input [(ngModel)]="form.location" placeholder="Portaria, Sala..."/></div>
      </div>
      <div class="form-group">
        <label>Protocolo</label>
        <select [(ngModel)]="form.protocol">
          <option value="rtsp">RTSP — câmeras IP / DVR / NVR</option>
          <option value="http">HTTP / MJPEG</option>
          <option value="local">Webcam local (USB)</option>
          <option value="file">Arquivo de vídeo</option>
          <option value="youtube">▶ YouTube</option>
        </select>
      </div>
      <div class="form-group">
        <label>URL / Endereço *</label>
        @if (form.protocol === 'file') {
          <div class="upload-zone" (click)="fileInput.click()" [class.uploading]="uploading()">
            <input #fileInput type="file" accept=".mp4,.avi,.mov,.mkv,.webm" style="display:none" (change)="onFileSelected($event)"/>
            @if (uploading()) {
              <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
                <div class="spinner"></div>
                <span style="font-size:12px;color:var(--muted)">Enviando vídeo...</span>
              </div>
            } @else if (form.url) {
              <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                <span style="font-size:12px;color:var(--primary);font-weight:500">{{ uploadedName || form.url }}</span>
                <span style="font-size:11px;color:var(--hint)">Clique para trocar</span>
              </div>
            } @else {
              <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--hint)" stroke-width="1.5"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
                <span style="font-size:13px;color:var(--muted);font-weight:500">Clique para fazer upload</span>
                <span style="font-size:11px;color:var(--hint)">MP4, AVI, MOV, MKV — máx. 500MB</span>
              </div>
            }
          </div>
          @if (form.url) {
            <input type="text" [(ngModel)]="form.url" placeholder="/tmp/video.mp4" style="margin-top:6px;font-size:11px;color:var(--hint)"/>
          }
        } @else if (form.protocol === 'youtube') {
          <div class="yt-input-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
            <input [(ngModel)]="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." style="flex:1;border:none;outline:none;font-size:13px;background:transparent"/>
            <button class="btn sm primary" (click)="downloadYoutube()" [disabled]="downloading()" style="flex-shrink:0">
              @if (downloading()) { <div class="spinner" style="width:12px;height:12px;border-width:2px;border-top-color:#fff"></div> Baixando... }
              @else { Baixar }
            </button>
          </div>
          @if (form.url) {
            <div style="margin-top:8px;font-size:12px;color:var(--primary);display:flex;align-items:center;gap:6px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
              Vídeo baixado com sucesso!
            </div>
          }
        } @else {
          <input [(ngModel)]="form.url" [placeholder]="urlPh()"/>
        }
        @if (urlHint() && form.protocol !== 'file' && form.protocol !== 'youtube') { <small>{{ urlHint() }}</small> }
      </div>
      @if (form.protocol !== 'local' && form.protocol !== 'file') {
        <div class="row-2">
          <div class="form-group"><label>Usuário</label><input [(ngModel)]="form.username" placeholder="admin"/></div>
          <div class="form-group"><label>Senha</label><input type="password" [(ngModel)]="form.password" placeholder="••••••"/></div>
        </div>
      }
      <div class="form-group">
        <label>Estabelecimento <span style="font-weight:400;color:var(--hint)">(opcional)</span></label>
        <select [(ngModel)]="form.location_obj">
          <option [ngValue]="null">Nenhum</option>
          @for (loc of locations(); track loc.id) {
            <option [ngValue]="loc.id">{{ loc.name }}{{ loc.city ? ' — ' + loc.city : '' }}</option>
          }
        </select>
        <small>Vincula esta câmera a um estabelecimento para cruzar dados de fluxo</small>
      </div>

      <div class="form-group">
        <label>
          Linha de contagem de visitantes
          <span style="font-weight:400;color:var(--hint)">(opcional)</span>
        </label>
        <div class="line-config" [class.line-active]="form.entry_line_y != null">
          <div class="line-preview" (click)="toggleEntryLine()">
            @if (form.entry_line_y != null) {
              <div class="line-indicator" [style.top.%]="form.entry_line_y * 100">
                <span class="line-label-left">ENTRADA</span>
                <div class="line-bar"></div>
                <span class="line-label-right">SAÍDA</span>
              </div>
              <div style="position:absolute;top:4px;right:4px;background:var(--primary);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px">ATIVA</div>
            } @else {
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;color:var(--hint)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="15,7 20,12 15,17"/></svg>
                <span style="font-size:11px">Clique para ativar linha de contagem</span>
              </div>
            }
          </div>
          @if (form.entry_line_y != null) {
            <div style="margin-top:10px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span>Posição da linha</span>
                <strong>{{ (form.entry_line_y * 100).toFixed(0) }}% do topo</strong>
              </div>
              <input type="range" min="0.1" max="0.9" step="0.01" [(ngModel)]="form.entry_line_y" style="width:100%"/>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint)">
                <span>↑ Topo</span><span>Base ↓</span>
              </div>
              <small>Coloque a linha na porta de entrada. Pessoas cruzando para baixo = entrada, para cima = saída.</small>
              <button class="btn sm ghost" style="color:var(--critical);margin-top:8px" (click)="form.entry_line_y = null">✕ Remover linha</button>
            </div>
          }
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn" (click)="showModal.set(false)">Cancelar</button>
        <button class="btn primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
          {{ saving() ? 'Salvando...' : 'Salvar câmera' }}
        </button>
      </div>
    </div>
  </div>
}
`, styles:[`
.stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:28px 24px;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden;box-shadow:var(--shadow-sm);transition:all .2s;&:hover{box-shadow:var(--shadow);transform:translateY(-1px)}}
.stat-card.stat-active{box-shadow:0 0 0 2px var(--primary);background:var(--primary-light)}
.stat-val{font-size:42px;font-weight:800;letter-spacing:-2px;line-height:1;margin-bottom:4px}
.stat-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.stat-icon{position:absolute;right:16px;top:50%;transform:translateY(-50%);opacity:.15}
.stat-online .stat-val{color:var(--primary)}.stat-online .stat-icon{color:var(--primary);opacity:.25}
.stat-offline .stat-val{color:var(--muted)}
.stat-alert .stat-val{color:var(--critical)}.stat-alert .stat-icon{color:var(--critical);opacity:.25}

.toolbar{display:flex;align-items:center;gap:10px}
.search-box{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px 16px;flex:1;&:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px rgba(29,158,117,.1)};input{border:none;outline:none;background:transparent;font-size:13px;width:100%;color:var(--text);&::placeholder{color:var(--hint)}}}
.clear-btn{background:none;border:none;color:var(--hint);font-size:12px;cursor:pointer;padding:0 2px;&:hover{color:var(--text)}}
.filter-select{padding:12px 16px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);font-size:13px;color:var(--text);outline:none;cursor:pointer;flex-shrink:0;white-space:nowrap;&:focus{border-color:var(--primary)}}
.view-toggle{margin-left:auto;display:flex;gap:4px;flex-shrink:0}
.view-btn{width:44px;height:44px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);transition:all .15s;&:hover{background:var(--bg);color:var(--text)}&.active{background:var(--primary);color:#fff;border-color:var(--primary)}}

.cam-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.cam-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-sm);transition:all .25s;&:hover{box-shadow:var(--shadow);transform:translateY(-2px)}}
.cam-card.cam-online{border-color:rgba(29,158,117,.25)}.cam-card.cam-alert{border-color:rgba(226,75,74,.25)}
.cam-preview{height:140px;background:#0c1425;position:relative;overflow:hidden}
.cam-no-feed{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;span{font-size:11px;color:rgba(255,255,255,.25);letter-spacing:.5px;text-transform:uppercase}}
.cam-status-pill{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;backdrop-filter:blur(8px)}
.cpill-online{background:rgba(29,158,117,.85);color:#fff;.cpill-dot{background:#fff;animation:blink 2s infinite}}
.cpill-offline{background:rgba(0,0,0,.55);color:rgba(255,255,255,.7);.cpill-dot{background:rgba(255,255,255,.5)}}
.cpill-alert{background:rgba(226,75,74,.85);color:#fff;.cpill-dot{background:#fff;animation:blink .8s infinite}}
.cpill-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.cam-proto-pill{position:absolute;bottom:10px;right:10px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(0,0,0,.5);color:rgba(255,255,255,.7);backdrop-filter:blur(4px);letter-spacing:.5px}
.cam-body{padding:12px 14px;border-bottom:1px solid var(--border)}
.cam-name{font-size:14px;font-weight:600;margin-bottom:3px}
.cam-loc{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px;margin-bottom:5px}
.cam-url{font-size:10.5px;color:var(--hint);font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cam-footer{padding:10px 14px;display:flex;align-items:center;justify-content:space-between;background:#fafbfc}
.cam-seen{font-size:11px;color:var(--hint)}
.cam-actions{display:flex;gap:6px}
.ca-btn{width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;&:hover{transform:scale(1.08)}}
.ca-start{color:var(--primary);border-color:var(--primary-mid);&:hover{background:var(--primary-light)}}
.ca-stop{color:var(--muted);&:hover{background:#f1f5f9}}
.ca-edit{color:var(--medium);&:hover{background:var(--medium-bg)}}
.ca-delete{color:var(--critical);&:hover{background:var(--critical-bg)}}

.table-cam-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.tcd-online{background:var(--primary)}.tcd-offline{background:#cbd5e1}.tcd-alert{background:var(--critical)}
.tbl-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:all .15s;white-space:nowrap;&:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}}
.tbl-start{color:var(--primary);border-color:var(--primary-mid);&:hover{background:var(--primary-light);border-color:var(--primary)}}
.tbl-stop{color:var(--muted);&:hover{background:#f1f5f9;color:var(--text)}}
.tbl-edit{color:var(--medium);border-color:rgba(59,130,246,.2);&:hover{background:var(--medium-bg);border-color:var(--medium)}}
.tbl-icon{width:30px;height:30px;border-radius:6px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;&:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}}
.tbl-del{color:var(--critical);&:hover{background:var(--critical-bg);border-color:rgba(226,75,74,.3)}}
.ca-live{color:#7c3aed;&:hover{background:#f3e8ff;border-color:#c4b5fd}}
.ca-logs{color:#7c3aed;&:hover{background:#f3e8ff;border-color:#c4b5fd}}
.live-dot{width:8px;height:8px;border-radius:50%;background:#cbd5e1}.live-active{background:var(--primary);animation:blink 1.5s infinite}
.logs-toolbar{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);flex-wrap:wrap}
.log-level-tabs{display:flex;gap:4px}
.llt{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;font-size:12px;font-weight:500;border:1px solid var(--border);border-radius:6px;background:var(--surface);cursor:pointer;color:var(--muted);transition:all .15s;&:hover{background:var(--bg)}}
.llt.llt-active{border-color:currentColor}
.llt.llt-active:not(.llt-detect):not(.llt-alert){background:#0f172a;color:#fff;border-color:#0f172a}
.llt-detect.llt-active{background:#f3e8ff;color:#7c3aed;border-color:#c4b5fd}
.llt-alert.llt-active{background:#fff1f1;color:var(--critical);border-color:#fca5a5}
.log-autoscroll{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);cursor:pointer;white-space:nowrap}
.logs-body{flex:1;overflow-y:auto;padding:8px 0;font-family:monospace;font-size:12px;background:#0d1117;margin:0 -28px;padding:12px 28px;color:#e2e8f0}
.log-line{display:flex;align-items:flex-start;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);&:last-child{border:none}}
.log-time{color:#64748b;flex-shrink:0;font-size:11px;padding-top:1px}
.log-badge{padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;flex-shrink:0;text-transform:uppercase}
.lb-info{background:#1e3a5f;color:#7dd3fc}
.lb-detect{background:#3b1a6b;color:#c4b5fd}
.lb-alert{background:#4c0519;color:#fda4af}
.lb-error{background:#450a0a;color:#fca5a5}
.log-msg{color:#cbd5e1;word-break:break-all}
.log-detect .log-msg{color:#c4b5fd}
.log-alert .log-msg{color:#fda4af;font-weight:600}
.log-error .log-msg{color:#fca5a5}
.dash-kpi{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px;text-align:center}
.dk-val{font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;margin-bottom:4px}
.dk-label{font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.ca-dash{color:#0369a1;&:hover{background:#e0f2fe;border-color:#7dd3fc}}
.tbl-live{color:#7c3aed;border-color:rgba(124,58,237,.2);&:hover{background:#f3e8ff;border-color:#c4b5fd}}
.tbl-logs{color:#7c3aed;border-color:rgba(124,58,237,.2);&:hover{background:#f3e8ff;border-color:#c4b5fd}}
.tbl-dash{color:#0369a1;border-color:rgba(3,105,161,.2);&:hover{background:#e0f2fe;border-color:#7dd3fc}}
`]})
export class CamerasComponent implements OnInit {
  private api = inject(ApiService);
  cameras   = signal<Camera[]>([]);
  loading   = signal(true);
  showModal = signal(false);
  editing   = signal<Camera|null>(null);
  saving    = signal(false);
  uploading = signal(false);
  locations = signal<any[]>([]);
  view         = signal<'grid'|'table'>('grid');
  filterStatus  = signal('');
  search        = signal('');
  filterProtocol = signal('');
  form: any = {};

  filtered = computed(() => {
    let list = this.cameras();
    if (this.filterStatus()) list = list.filter(c => c.status === this.filterStatus());
    if (this.filterProtocol()) list = list.filter(c => c.protocol === this.filterProtocol());
    const q = this.search().toLowerCase().trim();
    if (q) list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.location?.toLowerCase() ?? '').includes(q) ||
      (c.url?.toLowerCase() ?? '').includes(q)
    );
    return list;
  });

  uploadedName = '';
  youtubeUrl   = '';
  downloading  = signal(false);

  // Logs
  logsCamera   = signal<Camera|null>(null);
  logsFilter   = '';
  logsLevel    = signal<'all'|'detect'|'alert'>('all');
  autoScroll   = signal(true);
  logEntries   = signal<{id:number,type:string,time:string,msg:string}[]>([]);
  private logsInterval: any = null;
  private logIdSeq = 0;

  filteredLogs = computed(() => {
    let logs = this.logEntries();
    if (this.logsLevel() === 'detect') logs = logs.filter(l => l.type === 'detect');
    if (this.logsLevel() === 'alert')  logs = logs.filter(l => l.type === 'alert');
    if (this.logsFilter) { const q = this.logsFilter.toLowerCase(); logs = logs.filter(l => l.msg.toLowerCase().includes(q)); }
    return logs;
  });

  openLogs(cam: Camera) {
    this.logsCamera.set(cam);
    this.logEntries.set([]);
    this.addLog('info', `Câmera: ${cam.name} | Protocolo: ${cam.protocol?.toUpperCase()} | Status: ${cam.status}`);
    this.addLog('info', `URL: ${cam.url || "(não disponível)"}`);
    if (cam.is_active) {
      this.addLog('info', 'Monitoramento ativo — aguardando frames...');
      this.pollAlerts(cam);
    } else {
      this.addLog('info', 'Câmera parada. Clique em Iniciar para começar o processamento.');
    }
  }

  pollAlerts(cam: Camera) {
    this.logsInterval = setInterval(() => {
      this.api.getAlerts({ camera: String(cam.id), ordering: '-triggered_at', page_size: '5' }).subscribe((r: any) => {
        const list = Array.isArray(r) ? r : (r.results ?? []);
        list.slice(0,2).forEach((a: any) => {
          const exists = this.logEntries().find(l => l.msg.includes(`#${a.id}`));
          if (!exists) {
            this.addLog('alert', `🚨 ALERTA #${a.id} — ${a.rule_name} | Severidade: ${a.rule_severity} | ${a.description}`);
          }
        });
      });
      this.api.getCameras().subscribe((cams: any[]) => {
        const updated = cams.find(cc => cc.id === cam.id);
        if (updated) {
          if (updated.status !== cam.status) {
            this.addLog('info', `Status alterado: ${cam.status} → ${updated.status}`);
          }
          if (updated.last_seen) {
            this.addLog('detect', `Frame processado | último contato: ${this.fmtRelative(updated.last_seen)}`);
          }
        }
      });
    }, 3000);
  }

  addLog(type: string, msg: string) {
    const now = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    this.logEntries.update(l => [...l.slice(-200), {id: ++this.logIdSeq, type, time: now, msg}]);
  }

  closeLogs() {
    if (this.logsInterval) { clearInterval(this.logsInterval); this.logsInterval = null; }
    this.logsCamera.set(null);
  }

  clearLogs() { this.logEntries.set([]); }
  logTypeLabel(t: string): string { return ({info:'INFO',detect:'DETECT',alert:'ALERTA',error:'ERRO'} as any)[t] ?? t; }

  // Dashboard
  dashCamera = signal<Camera|null>(null);
  dashAlerts = signal<any[]>([]);
  dashStats  = computed(() => {
    const a = this.dashAlerts();
    return {
      total:    a.length,
      open:     a.filter(x => x.status === 'open').length,
      critical: a.filter(x => x.rule_severity === 'critical').length,
      resolved: a.filter(x => x.status === 'resolved').length,
    };
  });

  // Live stream
  liveCamera    = signal<Camera|null>(null);
  liveStreamUrl = signal<string|null>(null);
  liveLoading   = signal(false);
  liveError     = signal(false);

  openLive(cam: Camera) {
    this.liveCamera.set(cam);
    this.liveLoading.set(true);
    this.liveError.set(false);
    this.liveStreamUrl.set(null);
    // Get token - try multiple keys
    const token = localStorage.getItem('access_token') || '';
    setTimeout(() => {
      this.liveStreamUrl.set(this.api.getCameraStreamUrl(cam.id, token));
    }, 200);
  }

  closeLive() {
    this.liveStreamUrl.set(null);
    this.liveCamera.set(null);
  }

  onLiveError() {
    this.liveLoading.set(false);
    this.liveError.set(true);
    this.liveStreamUrl.set(null);
  }

  dashDetail  = signal<any>(null);
  dashLoading = signal(false);

  openDash(cam: Camera) {
    this.dashCamera.set(cam);
    this.dashDetail.set(null);
    this.dashLoading.set(true);
    this.api.getCameraDetail(cam.id).subscribe({
      next: (d) => {
        this.dashDetail.set(d);
        this.dashAlerts.set(d.recent_alerts ?? []);
        this.dashLoading.set(false);
      },
      error: () => {
        // Fallback to alerts only
        this.api.getAlerts({ camera: String(cam.id), ordering: '-triggered_at', page_size: '50' }).subscribe((r: any) => {
          this.dashAlerts.set(Array.isArray(r) ? r : (r.results ?? []));
          this.dashLoading.set(false);
        });
      }
    });
  }

  objectKeys(obj: any) { return obj ? Object.keys(obj) : []; }
  metricLabel(key: string): string {
    const m: Record<string,string> = {
      people_count:'Contagem de pessoas', queue_size:'Tamanho da fila',
      vehicle_count:'Contagem de veículos', motion_score:'Nível de movimento'
    };
    return m[key] ?? key;
  }

  sevColor(s: string): string {
    return ({critical:'var(--critical)',high:'var(--high)',medium:'var(--medium)',low:'var(--low)'} as any)[s] ?? '#999';
  }

  ngOnInit() {
    this.load();
    this.api.getLocations().subscribe((r: any) => this.locations.set(Array.isArray(r) ? r : (r.results ?? [])));
  }

  toggleEntryLine() {
    if (this.form.entry_line_y != null) return;
    this.form.entry_line_y = 0.5;
  }

  downloadYoutube() {
    if (!this.youtubeUrl) return;
    this.downloading.set(true);
    this.api.downloadYoutube(this.youtubeUrl).subscribe({
      next: (res) => {
        this.form.url = res.path;
        this.uploadedName = 'youtube_video.mp4';
        this.downloading.set(false);
      },
      error: (err: any) => {
        alert(err.error?.detail || 'Erro ao baixar vídeo do YouTube');
        this.downloading.set(false);
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.uploadVideo(file).subscribe({
      next: (res) => {
        this.form.url = res.path;
        this.uploadedName = res.filename;
        this.uploading.set(false);
      },
      error: (err) => {
        alert(err.error?.detail || 'Erro no upload');
        this.uploading.set(false);
      }
    });
  }
  load() { this.api.getCameras().subscribe((c: Camera[]) => { this.cameras.set(c); this.loading.set(false); }); }
  countByStatus(s: string) { return this.cameras().filter(c => c.status === s).length; }
  toggleFilter(s: string) { this.filterStatus.set(this.filterStatus() === s ? '' : s); }
  clearFilters() { this.filterStatus.set(''); this.search.set(''); this.filterProtocol.set(''); }

  openModal(c?: Camera) {
    this.editing.set(c || null);
    this.form = c ? { ...c } : { protocol: 'rtsp', is_active: true };
    this.showModal.set(true);
  }
  closeModal(e: MouseEvent) { if (e.target === e.currentTarget) this.showModal.set(false); }
  save() {
    if (!this.form.name || !this.form.url) return;
    this.saving.set(true);
    const req = this.editing() ? this.api.updateCamera(this.editing()!.id, this.form) : this.api.createCamera(this.form);
    req.subscribe({ next: () => { this.load(); this.showModal.set(false); this.saving.set(false); }, error: () => this.saving.set(false) });
  }
  camToDelete = signal<Camera|null>(null);
  camToStop   = signal<Camera|null>(null);
  confirmDelete(c: Camera) { this.camToDelete.set(c); }
  confirmStop(c: Camera)   { this.camToStop.set(c); }
  stopConfirmed() { const c = this.camToStop(); if (!c) return; this.api.stopCamera(c.id).subscribe(() => { this.load(); this.camToStop.set(null); }); }
  remove() { const c = this.camToDelete(); if (!c) return; this.api.deleteCamera(c.id).subscribe(() => { this.load(); this.camToDelete.set(null); }); }
  start(c: Camera) { this.api.startCamera(c.id).subscribe(() => this.load()); }
  truncUrl(u: string) { return u?.length > 42 ? u.substring(0, 42) + '...' : u; }
  fmtRelative(d: string) {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60) return 'agora'; if (diff < 3600) return `há ${Math.floor(diff/60)}min`;
    if (diff < 86400) return `há ${Math.floor(diff/3600)}h`; return `há ${Math.floor(diff/86400)}d`;
  }
  fmtDate(d: string) { return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  urlPh(): string { const m: any = { rtsp:'rtsp://192.168.1.100:554/stream1', http:'http://192.168.1.100/video', local:'0', file:'/videos/gravacao.mp4' }; return m[this.form.protocol] ?? ''; }
  urlHint(): string { const m: any = { local:'Use 0 para webcam padrão, 1 para segunda câmera', file:'Caminho absoluto do arquivo no servidor' }; return m[this.form.protocol] ?? ''; }
}
