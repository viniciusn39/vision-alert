import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { Tenant, Plan } from "../../../core/models/models";

@Component({ selector:"app-admin-tenants", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div><h1 class="page-title">Clientes</h1><p class="page-sub">{{ total() }} clientes cadastrados</p></div>
    <div style="display:flex;gap:8px">
      <select class="mini-select" [(ngModel)]="filterStatus" (ngModelChange)="load()"><option value="">Todos</option><option value="trial">Trial</option><option value="active">Ativo</option><option value="suspended">Suspenso</option></select>
    </div>
  </div>
  <div class="table-card">
    <table class="dt">
      <thead><tr><th>Empresa</th><th>E-mail</th><th>Plano</th><th>Revenda</th><th>Status</th><th>Criado em</th><th>Ações</th></tr></thead>
      <tbody>
        @for (t of tenants(); track t.id) {
          <tr>
            <td><div style="font-weight:500">{{ t.company_name }}</div><div style="font-size:11px;color:var(--muted)">{{ t.cnpj }}</div></td>
            <td style="font-size:12px">{{ t.email }}</td>
            <td><span class="badge medium">{{ t.plan_name }}</span></td>
            <td style="font-size:12px;color:var(--muted)">{{ t.partner_name || '—' }}</td>
            <td><span [class]="'badge ' + (t.status)">{{ t.status }}</span></td>
            <td style="font-size:12px;color:var(--muted)">{{ fmtDate(t.created_at) }}</td>
            <td>
              <div style="display:flex;gap:6px">
                @if (t.status === "active") { <button class="btn sm danger" (click)="suspend(t)">Suspender</button> }
                @if (t.status === "suspended") { <button class="btn sm primary" (click)="activate(t)">Ativar</button> }
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</div>
`, styles:[`.mini-select{padding:6px 10px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;background:#fff}`]})
export class AdminTenantsComponent implements OnInit {
  private api = inject(ApiService);
  tenants = signal<Tenant[]>([]);
  total   = signal(0);
  filterStatus = "";

  ngOnInit() { this.load(); }
  load() { this.api.adminTenants(this.filterStatus ? {status:this.filterStatus} : {}).subscribe(r => { this.tenants.set(r.results); this.total.set(r.count); }); }
  suspend(t: Tenant) { this.api.adminSuspendTenant(t.id).subscribe(() => this.load()); }
  activate(t: Tenant) { this.api.adminActivateTenant(t.id).subscribe(() => this.load()); }
  fmtDate(d: string) { return new Date(d).toLocaleDateString("pt-BR"); }
}
