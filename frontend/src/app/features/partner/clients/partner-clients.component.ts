import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ApiService } from "../../../core/services/api.service";
import { Tenant } from "../../../core/models/models";

@Component({ selector:"app-partner-clients", standalone:true, imports:[CommonModule], template:`
<div class="page-wrap">
  <div class="page-header"><div><h1 class="page-title">Meus Clientes</h1><p class="page-sub">{{ clients().length }} clientes</p></div></div>
  <div class="table-card">
    <table class="dt">
      <thead><tr><th>Empresa</th><th>E-mail</th><th>Plano</th><th>Status</th><th>Câmeras</th><th>Criado em</th></tr></thead>
      <tbody>
        @for (c of clients(); track c.id) {
          <tr>
            <td style="font-weight:500">{{ c.company_name }}</td>
            <td style="font-size:12px">{{ c.email }}</td>
            <td><span class="badge medium">{{ c.plan_name }}</span></td>
            <td><span [class]="'badge ' + (c.status)">{{ c.status }}</span></td>
            <td>{{ c.cameras_count }}</td>
            <td style="font-size:12px;color:var(--muted)">{{ fmtDate(c.created_at) }}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</div>
`})
export class PartnerClientsComponent implements OnInit {
  private api = inject(ApiService);
  clients = signal<Tenant[]>([]);
  ngOnInit() { this.api.partnerClients().subscribe(c => this.clients.set(c)); }
  fmtDate(d: string) { return new Date(d).toLocaleDateString("pt-BR"); }
}
