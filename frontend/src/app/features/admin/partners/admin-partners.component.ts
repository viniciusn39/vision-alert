import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { Partner } from "../../../core/models/models";

@Component({ selector:"app-admin-partners", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div><h1 class="page-title">Revendas</h1><p class="page-sub">Gerencie os parceiros comerciais</p></div>
    <button class="btn primary" (click)="openModal()">+ Nova revenda</button>
  </div>
  <div class="table-card">
    <table class="dt">
      <thead><tr><th>Empresa</th><th>E-mail</th><th>Comissão</th><th>Clientes</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>
        @for (p of partners(); track p.id) {
          <tr>
            <td><div style="font-weight:500">{{ p.company_name }}</div><div style="font-size:11px;color:var(--muted)">{{ p.cnpj }}</div></td>
            <td style="font-size:12px">{{ p.email }}</td>
            <td><span style="font-weight:600;color:var(--primary)">{{ p.commission_rate }}%</span></td>
            <td>{{ p.clients_count }}</td>
            <td><span [class]="'badge ' + (p.is_active ? 'active' : 'suspended')">{{ p.is_active ? 'Ativo' : 'Inativo' }}</span></td>
            <td><button class="btn sm" (click)="openModal(p)">Editar</button></td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</div>
@if (showModal()) {
  <div class="modal-backdrop" (click)="closeModal($event)">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-header"><h3>{{ editing() ? "Editar revenda" : "Nova revenda" }}</h3><button class="btn ghost sm" (click)="showModal.set(false)">✕</button></div>
      <div class="form-group"><label>Empresa *</label><input [(ngModel)]="form.company_name" placeholder="Revenda XYZ Ltda"/></div>
      <div class="form-group"><label>CNPJ</label><input [(ngModel)]="form.cnpj" placeholder="00.000.000/0001-00"/></div>
      <div class="form-group"><label>E-mail *</label><input type="email" [(ngModel)]="form.email" placeholder="contato&#64;revenda.com"/></div>
      <div class="form-group"><label>Telefone</label><input [(ngModel)]="form.phone" placeholder="(11) 99999-9999"/></div>
      <div class="form-group"><label>Comissão (%)</label><input type="number" [(ngModel)]="form.commission_rate" min="0" max="100" step="0.5"/></div>
      <div class="modal-footer">
        <button class="btn" (click)="showModal.set(false)">Cancelar</button>
        <button class="btn primary" (click)="save()">Salvar</button>
      </div>
    </div>
  </div>
}
`})
export class AdminPartnersComponent implements OnInit {
  private api = inject(ApiService);
  partners  = signal<Partner[]>([]);
  showModal = signal(false);
  editing   = signal<Partner|null>(null);
  form: any  = {};

  ngOnInit() { this.load(); }
  load() { this.api.adminPartners().subscribe(r => this.partners.set(r.results)); }
  openModal(p?: Partner) { this.editing.set(p||null); this.form = p ? {...p} : {commission_rate:10}; this.showModal.set(true); }
  closeModal(e: MouseEvent) { if (e.target === e.currentTarget) this.showModal.set(false); }
  save() {
    const req = this.editing() ? this.api.adminUpdatePartner(this.editing()!.id, this.form) : this.api.adminCreatePartner(this.form);
    req.subscribe(() => { this.load(); this.showModal.set(false); });
  }
}
