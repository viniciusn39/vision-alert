import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../../core/services/api.service";

@Component({ selector:"app-partner-dashboard", standalone:true, imports:[CommonModule,RouterLink], template:`
<div class="page-wrap">
  <div class="page-header"><div><h1 class="page-title">Painel da Revenda</h1><p class="page-sub">{{ data()?.partner?.company_name }}</p></div></div>
  @if (data()) {
    <div class="metrics-grid">
      <div class="metric"><div class="label">Clientes totais</div><div class="value" style="color:#0369a1">{{ data().clients.total }}</div><div class="sub">{{ data().clients.trial }} em trial</div></div>
      <div class="metric"><div class="label">Clientes ativos</div><div class="value" style="color:var(--primary)">{{ data().clients.active }}</div><div class="sub">pagando</div></div>
      <div class="metric"><div class="label">Suspensos</div><div class="value" style="color:var(--critical)">{{ data().clients.suspended }}</div><div class="sub">inadimplência</div></div>
      <div class="metric"><div class="label">Comissão acumulada</div><div class="value" style="color:var(--primary)">R$ {{ data().commission_total | number:"1.2-2" }}</div><div class="sub">{{ data()?.partner?.commission_rate }}% de R$ {{ data().revenue_base | number:"1.2-2" }}</div></div>
    </div>
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">Sua comissão</div>
      <p style="font-size:13px;color:var(--muted)">Você recebe <strong>{{ data()?.partner?.commission_rate }}%</strong> sobre cada fatura paga pelos seus clientes. Entre em contato conosco para acertar os pagamentos mensais.</p>
    </div>
  } @else { <div class="loading"><div class="spinner"></div></div> }
</div>
`})
export class PartnerDashboardComponent implements OnInit {
  private api = inject(ApiService);
  data = signal<any>(null);
  ngOnInit() { this.api.partnerDashboard().subscribe(d => this.data.set(d)); }
}
