import { Component, inject, OnInit, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ApiService } from "../../../core/services/api.service";
import { Invoice } from "../../../core/models/models";

@Component({ selector:"app-billing", standalone:true, imports:[CommonModule], template:`
<div class="page-wrap">

  <div class="page-header">
    <div><h1 class="page-title">Financeiro</h1><p class="page-sub">Assinatura e faturas</p></div>
  </div>

  <!-- Subscription card -->
  @if (sub()) {
    <div class="sub-card">
      <div class="sub-left">
        <div class="sub-plan-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <div>
          <div class="sub-plan-name">Plano {{ sub().plan_name }}</div>
          <div class="sub-plan-price">R$ {{ sub().plan_price }}<span>/mês</span></div>
        </div>
      </div>

      <div class="sub-divider"></div>

      <div class="sub-details">
        <div class="sub-detail">
          <div class="sd-label">Status</div>
          <div class="sd-val">
            <span class="sub-status-dot" [class.ssd-active]="sub().status==='active'"></span>
            {{ sub().status_display }}
          </div>
        </div>
        <div class="sub-detail">
          <div class="sd-label">Próxima cobrança</div>
          <div class="sd-val">{{ fmtDate(sub().next_billing_date) }}</div>
        </div>
        <div class="sub-detail">
          <div class="sd-label">Faturas em aberto</div>
          <div class="sd-val">
            @if (pendingCount() === 0) {
              <span style="opacity:.9">Nenhuma ✓</span>
            } @else {
              <span style="background:rgba(255,255,255,.25);color:#fff;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;backdrop-filter:blur(4px)">
                {{ pendingCount() }} pendente{{ pendingCount() > 1 ? 's' : '' }}
              </span>
            }
          </div>
        </div>
      </div>
    </div>
  } @else if (!loadingSub()) {
    <div class="card" style="text-align:center;padding:40px">
      <div style="font-size:40px;margin-bottom:16px">💳</div>
      <h3 style="margin-bottom:8px;font-weight:700">Ative sua assinatura</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:24px;line-height:1.6">Seu período de trial está ativo.<br/>Assine para continuar após o vencimento.</p>
      <button class="btn primary" (click)="activate()">Ativar assinatura — Boleto</button>
    </div>
  }

  <!-- Invoices -->
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <h2 style="font-size:15px;font-weight:650">Faturas</h2>
      @if (invoices().length > 0) {
        <div style="display:flex;gap:8px;font-size:12px;color:var(--muted)">
          <span>Total: <strong style="color:var(--text)">{{ invoices().length }}</strong></span>
          <span>·</span>
          <span>Pagas: <strong style="color:var(--primary)">{{ paidCount() }}</strong></span>
          @if (pendingCount() > 0) {
            <span>·</span>
            <span>Pendentes: <strong style="color:var(--critical)">{{ pendingCount() }}</strong></span>
          }
        </div>
      }
    </div>

    @if (invoices().length === 0 && !loadingSub()) {
      <div class="empty" style="padding:40px">
        <div class="empty-icon">🧾</div>
        <h4>Nenhuma fatura</h4>
        <p>As faturas aparecerão aqui após a ativação da assinatura</p>
      </div>
    } @else {
      <div class="table-card">
        <table class="dt">
          <thead>
            <tr>
              <th>#</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Forma</th>
              <th>Status</th>
              <th style="text-align:right">Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (inv of invoices(); track inv.id) {
              <tr [class.row-overdue]="inv.status==='overdue'" [class.row-pending]="inv.status==='pending'">
                <td style="font-size:12px;color:var(--hint);font-weight:600">#{{ inv.id }}</td>
                <td>
                  <div style="font-size:13px;font-weight:500">{{ inv.description || 'VisionAlert ' + inv.plan_name }}</div>
                  @if (inv.paid_at) {
                    <div style="font-size:11px;color:var(--primary)">Pago em {{ fmtDate(inv.paid_at) }}</div>
                  }
                </td>
                <td>
                  <span style="font-size:15px;font-weight:700" [style.color]="inv.status==='paid' ? 'var(--primary)' : inv.status==='overdue' ? 'var(--critical)' : 'var(--text)'">
                    R$ {{ inv.amount | number:"1.2-2" }}
                  </span>
                </td>
                <td style="font-size:12px">{{ fmtDate(inv.due_date) }}</td>
                <td>
                  <div class="method-badge" [class.mb-boleto]="inv.payment_method==='boleto'" [class.mb-pix]="inv.payment_method==='pix'">
                    {{ inv.payment_method === 'pix' ? '⚡ PIX' : '📄 Boleto' }}
                  </div>
                </td>
                <td>
                  <div class="inv-status" [class]="'is-'+inv.status">
                    <span class="is-dot"></span>
                    {{ inv.status_display || statLabel(inv.status) }}
                  </div>
                </td>
                <td style="text-align:right">
                  <div style="display:inline-flex;gap:6px">
                    @if (inv.boleto_url && inv.status !== 'paid') {
                      <a [href]="inv.boleto_url" target="_blank" class="inv-btn inv-boleto">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                        Abrir boleto
                      </a>
                    }
                    @if (inv.pix_copy_paste) {
                      <button class="inv-btn inv-pix" (click)="copyPix(inv.pix_copy_paste)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Copiar PIX
                      </button>
                    }
                    @if (inv.status === 'paid') {
                      <span style="font-size:12px;color:var(--primary);font-weight:600">✓ Pago</span>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>
</div>
`, styles:[`
/* Subscription card */
.sub-card{background:linear-gradient(135deg,var(--primary-dark) 0%,var(--primary) 60%,#22c55e 100%);border-radius:var(--r-lg);padding:28px 32px;display:flex;align-items:center;gap:32px;color:white;box-shadow:0 8px 24px rgba(29,158,117,.35)}
.sub-left{display:flex;align-items:center;gap:18px;flex-shrink:0}
.sub-plan-icon{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.25)}
.sub-plan-name{font-size:13px;font-weight:600;opacity:.85;margin-bottom:4px}
.sub-plan-price{font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;span{font-size:14px;font-weight:500;opacity:.7}}
.sub-divider{width:1px;height:60px;background:rgba(255,255,255,.2);flex-shrink:0}
.sub-details{display:flex;gap:32px;flex:1}
.sub-detail{display:flex;flex-direction:column;gap:4px}
.sd-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;opacity:.7}
.sd-val{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px}
.sub-status-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.35)}
.ssd-active{background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.2);animation:blink 2.5s infinite}

/* Table rows */
.row-overdue td{background:#fff8f8 !important}
.row-pending td{background:#fffdf5 !important}

/* Method badge */
.method-badge{display:inline-flex;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600}
.mb-boleto{background:#f1f5f9;color:#475569}
.mb-pix{background:#ecfdf5;color:#059669}

/* Invoice status */
.inv-status{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px}
.is-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.is-paid{background:#ecfdf5;color:#059669;.is-dot{background:#059669}}
.is-pending{background:#fffbeb;color:#D97706;.is-dot{background:#D97706}}
.is-overdue{background:#fff1f1;color:#DC2626;.is-dot{background:#DC2626;animation:blink 1.5s infinite}}
.is-cancelled{background:#f1f5f9;color:#64748b;.is-dot{background:#94a3b8}}

/* Action buttons */
.inv-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid;cursor:pointer;transition:all .15s;text-decoration:none;&:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}}
.inv-boleto{color:var(--medium);border-color:rgba(59,130,246,.25);background:var(--medium-bg);&:hover{background:#dbeafe}}
.inv-pix{color:#059669;border-color:rgba(5,150,105,.25);background:#ecfdf5;&:hover{background:#d1fae5}}
`]})
export class BillingComponent implements OnInit {
  private api = inject(ApiService);
  invoices   = signal<Invoice[]>([]);
  sub        = signal<any>(null);
  loadingSub = signal(true);
  copied     = signal(false);

  pendingCount = computed(() => this.invoices().filter(i => i.status === 'pending' || i.status === 'overdue').length);
  paidCount    = computed(() => this.invoices().filter(i => i.status === 'paid').length);

  ngOnInit() {
    this.api.getInvoices().subscribe((i: any) => this.invoices.set(Array.isArray(i) ? i : (i.results ?? [])));
    this.api.getSubscription().subscribe({
      next: s => { this.sub.set(s); this.loadingSub.set(false); },
      error: () => this.loadingSub.set(false)
    });
  }

  activate() { this.api.activateSubscription("boleto").subscribe(() => location.reload()); }

  copyPix(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  statLabel(s: string): string {
    return ({paid:"Pago", pending:"Pendente", overdue:"Vencido", cancelled:"Cancelado"} as any)[s] ?? s;
  }

  fmtDate(d: string): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR");
  }
}
