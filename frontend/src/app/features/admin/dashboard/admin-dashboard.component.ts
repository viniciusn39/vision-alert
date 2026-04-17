import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../../core/services/api.service";

@Component({ selector:"app-admin-dashboard", standalone:true, imports:[CommonModule,RouterLink], template:`
<div class="page-wrap">
  <div class="page-header"><div><h1 class="page-title">Painel Administrativo</h1><p class="page-sub">Visão geral de todos os clientes</p></div></div>
  @if (data()) {
    <div class="metrics-grid">
      <div class="metric"><div class="label">Clientes ativos</div><div class="value" style="color:#7c3aed">{{ data()!.tenants.active }}</div><div class="sub">{{ data()!.tenants.trial }} em trial</div></div>
      <div class="metric"><div class="label">Suspensos</div><div class="value" style="color:var(--critical)">{{ data()!.tenants.suspended }}</div><div class="sub">inadimplência</div></div>
      <div class="metric"><div class="label">Revendas ativas</div><div class="value">{{ data()!.partners.active }}</div><div class="sub">de {{ data()!.partners.total }} total</div></div>
      <div class="metric"><div class="label">Faturas pendentes</div><div class="value" style="color:var(--high)">{{ data()!.invoices.pending }}</div><div class="sub">{{ data()!.invoices.overdue }} vencidas</div></div>
    </div>
    <div class="grid-3">
      <div class="card" style="text-align:center">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Total de clientes</div>
        <div style="font-size:40px;font-weight:700;color:#7c3aed">{{ data()!.tenants.total }}</div>
        <a routerLink="/admin/tenants" style="font-size:12px;color:#7c3aed;margin-top:8px;display:block">Gerenciar →</a>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Receita (faturas pagas)</div>
        <div style="font-size:32px;font-weight:700;color:var(--primary)">R$ {{ data()!.mrr | number:'1.2-2' }}</div>
        <a routerLink="/admin/billing" style="font-size:12px;color:var(--primary);margin-top:8px;display:block">Ver faturas →</a>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Revendas</div>
        <div style="font-size:40px;font-weight:700">{{ data()!.partners.total }}</div>
        <a routerLink="/admin/partners" style="font-size:12px;color:var(--muted);margin-top:8px;display:block">Gerenciar →</a>
      </div>
    </div>
  } @else { <div class="loading"><div class="spinner"></div></div> }
</div>
`})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  data = signal<any>(null);
  ngOnInit() { this.api.adminDashboard().subscribe(d => this.data.set(d)); }
}
