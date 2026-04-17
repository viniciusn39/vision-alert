import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { Invoice } from "../../../core/models/models";

@Component({ selector:"app-admin-billing", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div><h1 class="page-title">Faturas</h1><p class="page-sub">{{ total() }} faturas no sistema</p></div>
    <select class="mini-select" [(ngModel)]="filterStatus" (ngModelChange)="load()"><option value="">Todas</option><option value="pending">Pendentes</option><option value="paid">Pagas</option><option value="overdue">Vencidas</option></select>
  </div>
  <div class="table-card">
    <table class="dt">
      <thead><tr><th>Cliente</th><th>Valor</th><th>Vencimento</th><th>Forma</th><th>Status</th><th>Pago em</th></tr></thead>
      <tbody>
        @for (inv of invoices(); track inv.id) {
          <tr>
            <td style="font-weight:500">{{ inv.tenant_name }}</td>
            <td style="font-weight:600;color:var(--primary)">R$ {{ inv.amount | number:"1.2-2" }}</td>
            <td style="font-size:12px">{{ fmtDate(inv.due_date) }}</td>
            <td style="font-size:12px">{{ inv.method_display }}</td>
            <td><span [class]="'badge ' + (inv.status)">{{ inv.status_display }}</span></td>
            <td style="font-size:12px;color:var(--muted)">{{ inv.paid_at ? fmtDate(inv.paid_at) : "—" }}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</div>
`, styles:[`.mini-select{padding:6px 10px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;background:#fff}`]})
export class AdminBillingComponent implements OnInit {
  private api = inject(ApiService);
  invoices = signal<Invoice[]>([]);
  total    = signal(0);
  filterStatus = "";
  ngOnInit() { this.load(); }
  load() { this.api.adminInvoices(this.filterStatus ? {status:this.filterStatus} : {}).subscribe(r => { this.invoices.set(r.results); this.total.set(r.count); }); }
  fmtDate(d: string) { return new Date(d).toLocaleDateString("pt-BR"); }
}
