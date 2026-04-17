import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { AlertRule, Camera } from "../../../core/models/models";

const BEHAVIORS = [
  // Básicos
  { value:"motion",              label:"Detecção de movimento",        icon:"🎯", desc:"Detecta qualquer movimento na área", group:"Básico" },
  { value:"restricted_zone",     label:"Zona restrita",                icon:"🚧", desc:"Acesso não autorizado a área delimitada", group:"Básico" },
  { value:"loitering",           label:"Permanência prolongada",       icon:"⏱",  desc:"Pessoa parada por tempo excessivo", group:"Básico" },
  { value:"crowding",            label:"Aglomeração",                  icon:"👥", desc:"Número excessivo de pessoas no local", group:"Básico" },
  { value:"night_movement",      label:"Movimento noturno",            icon:"🌙", desc:"Atividade detectada fora do horário", group:"Básico" },
  { value:"fall_detection",      label:"Queda / pessoa caída",         icon:"🏥", desc:"Pessoa caindo ou deitada no chão", group:"Básico" },
  { value:"missing_ppe",         label:"Ausência de EPI",              icon:"⛑",  desc:"Funcionário sem equipamento obrigatório", group:"Básico" },
  { value:"ai_vision",           label:"Análise por IA",               icon:"🤖", desc:"Análise inteligente por prompt personalizado", group:"Básico" },
  // Varejo
  { value:"people_counter",      label:"Contador de pessoas",          icon:"🔢", desc:"Conta e monitora fluxo de pessoas", group:"Varejo" },
  { value:"queue_detection",     label:"Fila longa",                   icon:"🧍", desc:"Excesso de pessoas em fila/caixa", group:"Varejo" },
  { value:"abandoned_object",    label:"Objeto abandonado",            icon:"👜", desc:"Bolsa/mochila sem dono próximo", group:"Varejo" },
  { value:"shoplifting_posture", label:"Postura suspeita de furto",    icon:"🕵️", desc:"Pessoa agachada suspeita próxima a prateleiras", group:"Varejo" },
  { value:"large_bag",           label:"Mochila/bolsa grande em zona", icon:"🎒", desc:"Pessoa com mala grande em área monitorada", group:"Varejo" },
  // Segurança
  { value:"running",             label:"Pessoa correndo",              icon:"🏃", desc:"Corrida detectada em área interna", group:"Segurança" },
  { value:"vehicle_pedestrian",  label:"Veículo em área de pedestre",  icon:"🚗", desc:"Carro/moto em calçada ou corredor", group:"Segurança" },
  { value:"perimeter_breach",    label:"Invasão de perímetro",         icon:"🔴", desc:"Pessoa em área de perímetro externo", group:"Segurança" },
  { value:"tailgating",          label:"Passagem não autorizada",      icon:"🚪", desc:"Múltiplas pessoas passando juntas por acesso", group:"Segurança" },
  // Saúde / Bem-estar
  { value:"lone_child",          label:"Criança desacompanhada",       icon:"👶", desc:"Criança sozinha detectada", group:"Saúde" },
  { value:"pool_risk",           label:"Risco em piscina",             icon:"🏊", desc:"Pessoa na borda da piscina sem supervisão", group:"Saúde" },
  { value:"bathroom_loiter",     label:"Permanência longa em banheiro",icon:"🚻", desc:"Pessoa por tempo excessivo em banheiro", group:"Saúde" },
  { value:"motionless_person",   label:"Pessoa imóvel",                icon:"🆘", desc:"Pessoa sem movimento (possível desmaio/emergência)", group:"Saúde" },
  // Indústria
  { value:"vehicle_zone",        label:"Veículo em zona proibida",     icon:"⚠️", desc:"Empilhadeira/veículo em área de pessoas", group:"Indústria" },
  { value:"no_hardhat",          label:"Sem capacete",                 icon:"🪖", desc:"Trabalhador detectado sem capacete", group:"Indústria" },
  { value:"animal_detection",    label:"Animal detectado",             icon:"🐾", desc:"Animal em área não permitida", group:"Indústria" },
  // Veículos
  { value:"wrong_way",           label:"Veículo sentido errado",       icon:"↩️", desc:"Veículo em mão contrária", group:"Veículos" },
  { value:"parking_violation",   label:"Estacionamento proibido",      icon:"🅿️", desc:"Veículo parado em local não permitido", group:"Veículos" },
  { value:"overcrowded_vehicle", label:"Excesso de pessoas no veículo",icon:"🚌", desc:"Muitas pessoas em/ao redor de veículo", group:"Veículos" },
];

const SEV_CONFIG: Record<string,{label:string,color:string,bg:string}> = {
  critical: { label:"Crítico",  color:"#DC2626", bg:"#fff1f1" },
  high:     { label:"Alto",     color:"#D97706", bg:"#fffbeb" },
  medium:   { label:"Médio",    color:"#2563EB", bg:"#eff6ff" },
  low:      { label:"Baixo",    color:"#059669", bg:"#ecfdf5" },
};

@Component({ selector:"app-rules", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Regras de Alerta</h1>
      <p class="page-sub">{{ rules().length }} regra{{ rules().length !== 1 ? 's' : '' }} configurada{{ rules().length !== 1 ? 's' : '' }}</p>
    </div>
    <button class="btn primary" (click)="openModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nova regra
    </button>
  </div>

  @if (rules().length === 0) {
    <div class="empty">
      <div class="empty-icon">🔔</div>
      <h4>Nenhuma regra configurada</h4>
      <p>Crie regras para definir quais comportamentos geram alertas</p>
      <button class="btn primary" style="margin-top:20px" (click)="openModal()">Criar primeira regra</button>
    </div>
  } @else {
    <div class="rules-list">
      @for (r of rules(); track r.id) {
        <div class="rule-card" [class.rule-inactive]="!r.is_active">

          <!-- Left: icon + info -->
          <div class="rule-left">
            <div class="rule-icon-wrap">
              <span class="rule-icon">{{ bhIcon(r.behavior) }}</span>
            </div>
            <div class="rule-info">
              <div class="rule-name">{{ r.name }}</div>
              <div class="rule-behavior">{{ bhLabel(r.behavior) }}</div>
            </div>
          </div>

          <!-- Middle: meta info -->
          <div class="rule-meta">
            <div class="rule-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
              {{ r.cameras.length === 0 ? 'Todas as câmeras' : r.cameras.length + ' câmera' + (r.cameras.length > 1 ? 's' : '') }}
            </div>
            <div class="rule-channels">
              @for (ch of r.channels; track ch) {
                <span class="ch-pill ch-{{ch}}">{{ ch }}</span>
              }
            </div>
          </div>

          <!-- Right: severity + toggle + actions -->
          <div class="rule-right">
            <div class="sev-badge" [style.color]="sevColor(r.severity)" [style.background]="sevBg(r.severity)">
              {{ sevLabel(r.severity) }}
            </div>

            <div class="rule-toggle" (click)="toggle(r)" [title]="r.is_active ? 'Desativar' : 'Ativar'">
              <div class="rt-track" [class.on]="r.is_active">
                <div class="rt-thumb"></div>
              </div>
            </div>

            <button class="rule-btn rule-edit" (click)="openModal(r)" title="Editar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar
            </button>
            <button class="rule-btn rule-del" (click)="confirmDelete(r)" title="Excluir">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      }
    </div>
  }
</div>

<!-- Delete modal -->
@if (ruleToDelete()) {
  <div class="modal-backdrop" (click)="ruleToDelete.set(null)">
    <div class="modal" style="max-width:400px" (click)="$event.stopPropagation()">
      <div style="text-align:center;padding:8px 0 20px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--critical-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--critical)" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </div>
        <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">Excluir regra?</h3>
        <p style="font-size:13px;color:var(--muted);line-height:1.5">
          Tem certeza que deseja excluir <strong>{{ ruleToDelete()!.name }}</strong>?<br/>Esta ação não pode ser desfeita.
        </p>
      </div>
      <div class="modal-footer" style="justify-content:center;gap:12px">
        <button class="btn" style="min-width:100px" (click)="ruleToDelete.set(null)">Cancelar</button>
        <button class="btn danger" style="min-width:100px" (click)="remove()">Excluir</button>
      </div>
    </div>
  </div>
}

<!-- Edit/Create modal -->
@if (showModal()) {
  <div class="modal-backdrop" (click)="closeModal($event)">
    <div class="modal rule-modal" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3>{{ editing() ? 'Editar regra' : 'Nova regra de alerta' }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Configure o comportamento monitorado</p>
        </div>
        <button class="btn ghost sm" (click)="showModal.set(false)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end">
        <div class="form-group" style="margin:0">
          <label>Nome *</label>
          <input [(ngModel)]="form.name" placeholder="Ex: Movimento noturno na entrada"/>
        </div>
        <div class="form-group" style="margin:0;min-width:160px">
          <label>Severidade</label>
          <select [(ngModel)]="form.severity">
            <option value="critical">🔴 Crítico</option>
            <option value="high">🟠 Alto</option>
            <option value="medium">🔵 Médio</option>
            <option value="low">🟢 Baixo</option>
          </select>
        </div>
      </div>

      <!-- Behavior -->
      <div class="section-block">
        <div class="section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          Comportamento *
        </div>
        <div class="beh-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input [(ngModel)]="behSearch" placeholder="Buscar comportamento..."/>
        </div>
          @if (!behSearch) {
            <div class="beh-groups">
              @for (group of behaviorGroups(); track group.name) {
                <div>
                  <div class="beh-group-label">{{ group.name }}</div>
                  <div class="beh-grid">
                    @for (b of group.items; track b.value) {
                      <div class="beh-opt" [class.beh-selected]="form.behavior === b.value" (click)="form.behavior = b.value">
                        <span style="font-size:18px">{{ b.icon }}</span>
                        <span class="beh-lbl">{{ b.label }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="beh-grid" style="margin-top:8px">
              @for (b of filteredBehaviors(); track b.value) {
                <div class="beh-opt" [class.beh-selected]="form.behavior === b.value" (click)="form.behavior = b.value; behSearch=''">
                  <span style="font-size:18px">{{ b.icon }}</span>
                  <span class="beh-lbl">{{ b.label }}</span>
                </div>
              }
            </div>
          }
          @if (form.behavior && bhDesc(form.behavior)) {
            <div class="beh-desc">
              <span class="beh-desc-icon">{{ bhIcon(form.behavior) }}</span>
              <div><strong>{{ bhLabel(form.behavior) }}</strong><span class="beh-desc-text"> — {{ bhDesc(form.behavior) }}</span></div>
            </div>
          }
        </div>

      <!-- Dynamic params -->
      @if (behaviorHasParams(form.behavior)) {
        <div class="params-card">
          <div class="params-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            Parâmetros — {{ bhLabel(form.behavior) }}
          </div>

          @if (form.behavior === 'crowding' || form.behavior === 'people_counter') {
            <div class="row-2">
              <div class="form-group" style="margin:0">
                <label>{{ form.behavior === 'people_counter' ? 'Máximo de pessoas no local' : 'Limite para aglomeração' }}</label>
                <input type="number" [(ngModel)]="p_crowd" min="2"/>
                <small>Alerta quando atingir ou ultrapassar este valor</small>
              </div>
            </div>
          }

          @if (form.behavior === 'queue_detection') {
            <div class="row-2">
              <div class="form-group" style="margin:0">
                <label>Máximo de pessoas na fila</label>
                <input type="number" [(ngModel)]="p_queue_limit" min="2"/>
                <small>Alerta quando a fila ultrapassar este número</small>
              </div>
            </div>
          }

          @if (form.behavior === 'loitering' || form.behavior === 'bathroom_loiter') {
            <div class="row-2">
              <div class="form-group" style="margin:0">
                <label>{{ form.behavior === 'bathroom_loiter' ? 'Tempo máximo em minutos' : 'Tempo limite em segundos' }}</label>
                <input type="number" [(ngModel)]="p_loiter" [min]="form.behavior === 'bathroom_loiter' ? 1 : 30"/>
                <small>{{ form.behavior === 'bathroom_loiter' ? 'Alerta após este tempo no banheiro' : 'Alerta após este tempo parado' }}</small>
              </div>
            </div>
          }

          @if (form.behavior === 'night_movement') {
            <div class="row-2">
              <div class="form-group" style="margin:0"><label>Início do período (hora)</label><input type="number" [(ngModel)]="p_start" min="0" max="23"/></div>
              <div class="form-group" style="margin:0"><label>Fim do período (hora)</label><input type="number" [(ngModel)]="p_end" min="0" max="23"/></div>
            </div>
            <small style="display:block;margin-top:6px">Movimentos detectados entre {{ p_start }}h e {{ p_end }}h disparam alerta</small>
          }

          @if (form.behavior === 'tailgating') {
            <div class="row-2">
              <div class="form-group" style="margin:0">
                <label>Máximo permitido por passagem</label>
                <input type="number" [(ngModel)]="p_max_allowed" min="1" max="10"/>
                <small>Alerta quando mais de X pessoas passarem juntas</small>
              </div>
            </div>
          }

          @if (form.behavior === 'overcrowded_vehicle') {
            <div class="row-2">
              <div class="form-group" style="margin:0">
                <label>Máximo de pessoas no/ao redor do veículo</label>
                <input type="number" [(ngModel)]="p_crowd" min="2"/>
              </div>
            </div>
          }

          @if (form.behavior === 'ai_vision') {
            <div class="form-group" style="margin:0">
              <label>Prompt para a IA</label>
              <textarea [(ngModel)]="p_prompt" rows="3" placeholder="Ex: Detecte se há alguma briga ou conflito físico entre pessoas. Responda JSON: {alerta: bool, descricao: string}"></textarea>
              <small>Descreva o comportamento que a IA deve detectar no frame</small>
            </div>
          }
        </div>
      }

      <!-- Schedule — funciona pra qualquer regra -->
      <div class="schedule-card">
        <label class="schedule-toggle">
          <input type="checkbox" [(ngModel)]="scheduleEnabled"/>
          <span class="schedule-toggle-track"><span class="schedule-toggle-thumb"></span></span>
          <span class="schedule-toggle-label">Agendar horário de funcionamento</span>
        </label>

        @if (scheduleEnabled) {
          <div class="schedule-body">
            <div class="schedule-hours">
              <div class="sh-label">Horário ativo</div>
              <div class="sh-row">
                <div class="sh-picker">
                  <span class="sh-small">De</span>
                  <div class="sh-time">
                    <button class="sh-btn" (click)="p_start = p_start > 0 ? p_start - 1 : 23">−</button>
                    <span class="sh-val">{{ p_start.toString().padStart(2,'0') }}:00</span>
                    <button class="sh-btn" (click)="p_start = p_start < 23 ? p_start + 1 : 0">+</button>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted);flex-shrink:0"><polyline points="9,18 15,12 9,6"/></svg>
                <div class="sh-picker">
                  <span class="sh-small">Até</span>
                  <div class="sh-time">
                    <button class="sh-btn" (click)="p_end = p_end > 0 ? p_end - 1 : 23">−</button>
                    <span class="sh-val">{{ p_end.toString().padStart(2,'0') }}:00</span>
                    <button class="sh-btn" (click)="p_end = p_end < 23 ? p_end + 1 : 0">+</button>
                  </div>
                </div>
              </div>
              <div class="sh-hint">
                @if (p_start <= p_end) {
                  Ativa das {{ p_start }}h às {{ p_end }}h
                } @else {
                  Ativa das {{ p_start }}h às {{ p_end }}h (cruza meia-noite)
                }
              </div>
            </div>

            <div class="schedule-days">
              <div class="sh-label">Dias da semana</div>
              <div class="sd-row">
                @for (day of dayLabels; track day; let i = $index) {
                  <button class="sd-btn" [class.sd-active]="scheduleDays.includes(i)" (click)="toggleDay(i)">
                    {{ day }}
                  </button>
                }
              </div>
              <div class="sh-hint">
                @if (scheduleDays.length === 0 || scheduleDays.length === 7) {
                  Todos os dias
                } @else {
                  {{ formatDays() }}
                }
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Cameras -->
      <div class="section-block">
        <div class="section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
          Câmeras <span style="font-weight:400;color:var(--hint);font-size:11px;text-transform:none;letter-spacing:0">(vazio = todas)</span>
        </div>
        <div class="cam-grid">
          @for (cam of cameras(); track cam.id) {
            <label class="cam-check-item" [class.selected]="selCams.includes(cam.id)">
              <input type="checkbox" [checked]="selCams.includes(cam.id)" (change)="toggleCam(cam.id, $any($event.target).checked)" style="display:none"/>
              <span class="cam-check-dot" [class]="'ccd-' + cam.status"></span>
              <div>
                <div style="font-size:12px;font-weight:500">{{ cam.name }}</div>
                <div style="font-size:10px;color:var(--muted)">{{ cam.location }}</div>
              </div>
            </label>
          }
        </div>
      </div>

      <!-- Channels & Cooldown -->
      <div class="section-block">
        <div class="section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 003 3h14a3 3 0 003-3lll-5-10-5 10"/><path d="M12 2v8"/></svg>
          Notificações
        </div>
        <div class="channel-grid">
          @for (ch of chOpts; track ch) {
            <label class="ch-check" [class.ch-selected]="form.channels?.includes(ch)">
              <input type="checkbox" [checked]="form.channels?.includes(ch)" (change)="toggleCh(ch, $any($event.target).checked)" style="display:none"/>
              <span class="ch-icon">{{ chIcon(ch) }}</span>
              <span style="font-size:12px;font-weight:500">{{ ch }}</span>
            </label>
          }
        </div>
      </div>

      <div class="row-2">
        <div class="form-group">
          <label>Cooldown (segundos)</label>
          <input type="number" [(ngModel)]="form.cooldown_seconds" min="10"/>
          <small>Intervalo mínimo entre alertas consecutivos</small>
        </div>
        @if (form.channels?.includes('webhook')) {
          <div class="form-group"><label>Webhook URL</label><input [(ngModel)]="form.webhook_url" placeholder="https://..."/></div>
        }
      </div>

      <div class="modal-footer">
        <button class="btn" (click)="showModal.set(false)">Cancelar</button>
        <button class="btn primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
          {{ saving() ? 'Salvando...' : 'Salvar regra' }}
        </button>
      </div>
    </div>
  </div>
}
`, styles:[`
.rules-list { display:flex;flex-direction:column;gap:8px }
.modal .form-group { margin-bottom:16px } .modal .params-card { margin:4px 0 8px }
.rule-modal{max-width:860px;max-height:92vh;overflow-y:auto}
.rule-card { background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 20px;display:flex;align-items:center;gap:20px;box-shadow:var(--shadow-sm);transition:all .2s;&:hover{box-shadow:var(--shadow);transform:translateY(-1px)} }
.rule-card.rule-inactive { opacity:.55 }

.section-block{margin-bottom:28px;margin-top:24px}
.section-label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)}

.rule-left { display:flex;align-items:center;gap:14px;flex:1;min-width:0 }
.rule-icon-wrap { width:44px;height:44px;border-radius:12px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px }
.rule-info { min-width:0 }
.rule-name { font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.rule-behavior { font-size:12px;color:var(--muted);margin-top:2px }

.rule-meta { display:flex;flex-direction:column;gap:5px;min-width:160px }
.rule-meta-item { display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted) }
.rule-channels { display:flex;gap:4px;flex-wrap:wrap }
.ch-pill { padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.3px }
.ch-telegram { background:#e0f2fe;color:#0369a1 }
.ch-email { background:#f0fdf4;color:#166534 }
.ch-sms { background:#fef3c7;color:#92400e }
.ch-webhook { background:#f3e8ff;color:#7c3aed }

.rule-right { display:flex;align-items:center;gap:10px;flex-shrink:0 }
.sev-badge { padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.3px }
.rule-toggle { cursor:pointer }
.rt-track { width:40px;height:22px;border-radius:99px;background:#cbd5e1;position:relative;transition:background .2s;flex-shrink:0 }
.rt-track.on { background:var(--primary) }
.rt-thumb { position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:3px;left:3px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.25) }
.rt-track.on .rt-thumb { left:21px }
.rule-btn { display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:7px;font-size:12px;font-weight:500;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:all .15s;&:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)} }
.rule-edit { color:var(--medium);border-color:rgba(59,130,246,.2);&:hover{background:var(--medium-bg)} }
.rule-del { padding:6px 10px;color:var(--critical);&:hover{background:var(--critical-bg);border-color:rgba(226,75,74,.2)} }

/* Modal camera checkboxes */
/* Cameras */
.cam-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cam-check-item{display:flex;align-items:center;gap:10px;padding:11px 14px;border:1.5px solid var(--border);border-radius:var(--r-sm);cursor:pointer;transition:all .15s;background:var(--surface);&:hover{border-color:var(--primary);background:var(--primary-light);transform:translateY(-1px)}}
.cam-check-item.selected{border-color:var(--primary);background:var(--primary-light);box-shadow:0 0 0 3px rgba(16,185,129,.1)}
.cam-check-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 2px var(--surface)}
.ccd-online{background:var(--primary)}.ccd-offline{background:#cbd5e1}.ccd-alert{background:var(--critical)}

/* Channels */
.channel-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.ch-check{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;border:1.5px solid var(--border);border-radius:var(--r-sm);cursor:pointer;transition:all .15s;text-align:center;background:var(--surface);&:hover{border-color:var(--primary);transform:translateY(-1px)}}
.ch-check.ch-selected{border-color:var(--primary);background:var(--primary-light);box-shadow:0 0 0 3px rgba(16,185,129,.1)}

/* Behavior */
.beh-search{display:flex;align-items:center;gap:8px;border:1.5px solid var(--border);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:14px;background:var(--surface);&:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px rgba(16,185,129,.08)};input{border:none;outline:none;background:transparent;font-size:13px;width:100%;color:var(--text)}}
.beh-groups{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;padding:2px 6px 2px 0}
.beh-group-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--hint);padding:2px 0 6px}
.beh-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.beh-opt{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 6px;border:1.5px solid var(--border);border-radius:var(--r-sm);cursor:pointer;transition:all .15s;text-align:center;background:var(--surface);&:hover{border-color:var(--primary);background:var(--primary-light);transform:translateY(-1px)}}
.beh-opt.beh-selected{border-color:var(--primary)!important;background:var(--primary-light)!important;box-shadow:0 0 0 3px rgba(16,185,129,.1)}
.beh-lbl{font-size:11px;font-weight:500;color:var(--muted);line-height:1.3}
.beh-opt.beh-selected .beh-lbl{color:var(--primary)}
.beh-desc{display:flex;align-items:center;gap:10px;background:var(--primary-light);border:1px solid var(--primary-mid);border-radius:var(--r-sm);padding:10px 14px;font-size:12px;color:var(--text);margin-top:14px;margin-bottom:12px}
.beh-desc-icon{font-size:20px;flex-shrink:0}
.beh-desc-text{color:var(--muted)}
.params-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--r);padding:16px 20px;display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
.params-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.ch-icon { font-size:18px }
.schedule-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--r);padding:16px 20px;margin:20px 0}
.schedule-toggle{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none}
.schedule-toggle input{display:none}
.schedule-toggle-track{position:relative;width:36px;height:20px;background:var(--border);border-radius:10px;transition:background .2s;flex-shrink:0}
.schedule-toggle input:checked ~ .schedule-toggle-track{background:var(--primary)}
.schedule-toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.schedule-toggle input:checked ~ .schedule-toggle-track .schedule-toggle-thumb{transform:translateX(16px)}
.schedule-toggle-label{font-size:13px;font-weight:500}
.schedule-body{margin-top:16px;display:flex;flex-direction:column;gap:16px}
.schedule-hours,.schedule-days{display:flex;flex-direction:column;gap:8px}
.sh-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.sh-row{display:flex;align-items:center;gap:12px}
.sh-picker{display:flex;flex-direction:column;align-items:center;gap:4px}
.sh-small{font-size:10px;color:var(--hint)}
.sh-time{display:flex;align-items:center;gap:0;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden}
.sh-btn{width:32px;height:36px;border:none;background:var(--surface);cursor:pointer;font-size:16px;color:var(--muted);display:flex;align-items:center;justify-content:center;transition:all .15s}
.sh-btn:hover{background:var(--primary-light);color:var(--primary)}
.sh-val{width:56px;height:36px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;font-family:monospace;background:var(--bg);border-left:1px solid var(--border);border-right:1px solid var(--border)}
.sh-hint{font-size:11px;color:var(--hint)}
.sd-row{display:flex;gap:6px}
.sd-btn{padding:8px 12px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);transition:all .15s}
.sd-btn:hover{border-color:var(--primary);color:var(--primary)}
.sd-btn.sd-active{background:var(--primary);color:#fff;border-color:var(--primary)}
`]})
export class RulesComponent implements OnInit {
  private api = inject(ApiService);
  behaviors = BEHAVIORS;
  chOpts = ["telegram","email","sms","webhook"];
  rules      = signal<AlertRule[]>([]);
  cameras    = signal<Camera[]>([]);
  showModal  = signal(false);
  editing    = signal<AlertRule|null>(null);
  saving     = signal(false);
  ruleToDelete = signal<AlertRule|null>(null);
  form: any  = {};
  behSearch  = '';
  selCams: number[] = [];
  p_crowd=5; p_loiter=300; p_start=22; p_end=6; p_prompt="";
  p_queue_limit=5; p_max_allowed=1;
  scheduleEnabled = false;
  scheduleDays: number[] = [];
  dayLabels = ['Seg','Ter','Qua','Qui','Sex','Sab','Dom'];

  ngOnInit() {
    this.api.getRules().subscribe(r => this.rules.set(r));
    this.api.getCameras().subscribe(c => this.cameras.set(c));
  }

  openModal(r?: AlertRule) {
    this.editing.set(r||null);
    this.form = r ? {...r} : {behavior:"motion",severity:"medium",is_active:true,channels:["telegram"],cooldown_seconds:60};
    this.selCams = r?.cameras ?? [];
    if (r?.params) {
      this.p_crowd       = r.params["crowd_count"] ?? r.params["max_people"] ?? 5;
      this.p_queue_limit = r.params["queue_limit"] ?? 5;
      this.p_loiter      = r.params["loitering_seconds"] ?? r.params["minutes"] ?? 300;
      this.p_start       = r.params["schedule_start"] ?? 22;
      this.p_end         = r.params["schedule_end"] ?? 6;
      this.p_max_allowed = r.params["max_allowed"] ?? 1;
      this.p_prompt      = r.params["ai_prompt"] ?? "";
      this.scheduleEnabled = r.params["schedule_start"] != null && r.params["schedule_end"] != null;
      this.scheduleDays  = r.params["schedule_days"] ?? [];
    } else {
      this.p_crowd = 5; this.p_queue_limit = 5; this.p_loiter = 300;
      this.p_start = 22; this.p_end = 6; this.p_max_allowed = 1; this.p_prompt = "";
      this.scheduleEnabled = false; this.scheduleDays = [];
    }
    this.showModal.set(true);
  }

  closeModal(e: MouseEvent) { if (e.target === e.currentTarget) this.showModal.set(false); }

  toggleCh(ch: string, on: boolean) {
    const c = [...(this.form.channels||[])];
    if (on) { if (!c.includes(ch)) c.push(ch); }
    else { const i = c.indexOf(ch); if (i > -1) c.splice(i,1); }
    this.form.channels = c;
  }

  toggleCam(id: number, on: boolean) {
    if (on) { if (!this.selCams.includes(id)) this.selCams = [...this.selCams, id]; }
    else { this.selCams = this.selCams.filter(x => x !== id); }
  }

  buildParams() {
    const b = this.form.behavior;
    let params: any = {};
    if (b === "crowding")           params = { crowd_count: this.p_crowd };
    else if (b === "people_counter")     params = { max_people: this.p_crowd };
    else if (b === "queue_detection")    params = { queue_limit: this.p_queue_limit };
    else if (b === "loitering")          params = { loitering_seconds: this.p_loiter };
    else if (b === "bathroom_loiter")    params = { minutes: this.p_loiter };
    else if (b === "night_movement")     params = { schedule_start: this.p_start, schedule_end: this.p_end };
    else if (b === "tailgating")         params = { max_allowed: this.p_max_allowed };
    else if (b === "overcrowded_vehicle") params = { max_people: this.p_crowd };
    else if (b === "ai_vision")          params = { ai_prompt: this.p_prompt };

    // Adiciona schedule universal se ativado
    if (this.scheduleEnabled) {
      params.schedule_start = this.p_start;
      params.schedule_end = this.p_end;
      if (this.scheduleDays.length > 0 && this.scheduleDays.length < 7) {
        params.schedule_days = this.scheduleDays;
      }
    }
    return params;
  }

  formatDays() {
    return this.scheduleDays.map(d => this.dayLabels[d]).join(', ');
  }

  toggleDay(day: number) {
    if (this.scheduleDays.includes(day)) {
      this.scheduleDays = this.scheduleDays.filter(d => d !== day);
    } else {
      this.scheduleDays = [...this.scheduleDays, day].sort();
    }
  }

  behaviorHasParams(b: string): boolean {
    return ["crowding","people_counter","queue_detection","loitering","bathroom_loiter",
            "night_movement","tailgating","overcrowded_vehicle","ai_vision"].includes(b);
  }

  save() {
    if (!this.form.name || !this.form.behavior) return;
    this.saving.set(true);
    const payload = {...this.form, cameras: this.selCams.map(Number), params: this.buildParams()};
    const req = this.editing() ? this.api.updateRule(this.editing()!.id, payload) : this.api.createRule(payload);
    req.subscribe({
      next: () => { this.api.getRules().subscribe(r => this.rules.set(r)); this.showModal.set(false); this.saving.set(false); },
      error: () => this.saving.set(false)
    });
  }

  toggle(r: AlertRule) {
    this.api.toggleRule(r.id).subscribe(res =>
      this.rules.update(rs => rs.map(x => x.id === r.id ? {...x, is_active: res.is_active} : x))
    );
  }

  confirmDelete(r: AlertRule) { this.ruleToDelete.set(r); }
  remove() {
    const r = this.ruleToDelete();
    if (!r) return;
    this.api.deleteRule(r.id).subscribe(() => {
      this.rules.update(rs => rs.filter(x => x.id !== r.id));
      this.ruleToDelete.set(null);
    });
  }

  filteredBehaviors() {
    const q = this.behSearch.toLowerCase();
    return BEHAVIORS.filter(b => b.label.toLowerCase().includes(q) || (b as any).group?.toLowerCase().includes(q));
  }
  updateBehSearch() {} // trigger change detection

  bhLabel(b: string) { return BEHAVIORS.find(x => x.value === b)?.label ?? b; }
  bhIcon(b: string)  { return BEHAVIORS.find(x => x.value === b)?.icon ?? "🔔"; }
  bhDesc(b: string)  { return BEHAVIORS.find(x => x.value === b)?.desc ?? ""; }
  bhGroup(b: string) { return (BEHAVIORS.find(x => x.value === b) as any)?.group ?? ""; }

  behaviorGroups() {
    const groups: {name:string, items:any[]}[] = [];
    BEHAVIORS.forEach(b => {
      const g = (b as any).group ?? "Outros";
      const existing = groups.find(x => x.name === g);
      if (existing) existing.items.push(b);
      else groups.push({ name: g, items: [b] });
    });
    return groups;
  }
  sevLabel(s: string) { return SEV_CONFIG[s]?.label ?? s; }
  sevColor(s: string) { return SEV_CONFIG[s]?.color ?? "#666"; }
  sevBg(s: string)    { return SEV_CONFIG[s]?.bg ?? "#f3f4f6"; }
  chIcon(ch: string): string {
    const m: Record<string,string> = { telegram:"✈️", email:"📧", sms:"💬", webhook:"🔗" };
    return m[ch] ?? "🔔";
  }
}
