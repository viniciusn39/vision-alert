import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { Plan } from "../../../core/models/models";

@Component({ selector:"app-admin-plans", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div><h1 class="page-title">Planos</h1><p class="page-sub">Configure os planos disponíveis</p></div>
    <button class="btn primary" (click)="openModal()">+ Novo plano</button>
  </div>
  <div class="grid-2">
    @for (p of plans(); track p.id) {
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:16px;font-weight:600">{{ p.display_name }}</div>
            <div style="font-size:22px;font-weight:700;color:var(--primary)">{{ p.price == 0 ? "Grátis" : "R$ " + p.price }}<span style="font-size:12px;font-weight:400;color:var(--muted)">/mês</span></div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span [class]="'badge ' + (p.is_active ? 'active' : 'offline')">{{ p.is_active ? "Ativo" : "Inativo" }}</span>
            <button class="btn sm" (click)="openModal(p)">Editar</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">
          <div>📷 {{ p.max_cameras }} câmera{{ p.max_cameras > 1 ? "s" : "" }}</div>
          <div>👥 {{ p.max_users }} usuário{{ p.max_users > 1 ? "s" : "" }}</div>
          <div>🔔 {{ p.max_rules }} regra{{ p.max_rules > 1 ? "s" : "" }}</div>
          @if (p.features["ai_vision"]) { <div>✨ Claude Vision IA</div> }
        </div>
      </div>
    }
  </div>
</div>
@if (showModal()) {
  <div class="modal-backdrop" (click)="closeModal($event)">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-header"><h3>{{ editing() ? "Editar plano" : "Novo plano" }}</h3><button class="btn ghost sm" (click)="showModal.set(false)">✕</button></div>
      <div class="row-2">
        <div class="form-group"><label>Nome interno</label><select [(ngModel)]="form.name"><option value="free">free</option><option value="starter">starter</option><option value="pro">pro</option><option value="enterprise">enterprise</option></select></div>
        <div class="form-group"><label>Nome exibido</label><input [(ngModel)]="form.display_name" placeholder="Pro"/></div>
      </div>
      <div class="row-2">
        <div class="form-group"><label>Preço (R$/mês)</label><input type="number" [(ngModel)]="form.price" min="0"/></div>
        <div class="form-group"><label>Max câmeras</label><input type="number" [(ngModel)]="form.max_cameras" min="1"/></div>
      </div>
      <div class="row-2">
        <div class="form-group"><label>Max usuários</label><input type="number" [(ngModel)]="form.max_users" min="1"/></div>
        <div class="form-group"><label>Max regras</label><input type="number" [(ngModel)]="form.max_rules" min="1"/></div>
      </div>
      <div class="form-group">
        <label>Features (JSON)</label>
        <textarea [(ngModel)]="featuresStr" rows="3" placeholder='{"ai_vision":true}'></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn" (click)="showModal.set(false)">Cancelar</button>
        <button class="btn primary" (click)="save()">Salvar</button>
      </div>
    </div>
  </div>
}
`})
export class AdminPlansComponent implements OnInit {
  private api = inject(ApiService);
  plans = signal<Plan[]>([]);
  showModal = signal(false);
  editing = signal<Plan|null>(null);
  form: any = {};
  featuresStr = "{}";
  ngOnInit() { this.load(); }
  load() { this.api.adminPlans().subscribe(p => this.plans.set(p)); }
  openModal(p?: Plan) {
    this.editing.set(p||null);
    this.form = p ? {...p} : {price:0, max_cameras:5, max_users:5, max_rules:10};
    this.featuresStr = p ? JSON.stringify(p.features) : "{}";
    this.showModal.set(true);
  }
  closeModal(e: MouseEvent) { if (e.target === e.currentTarget) this.showModal.set(false); }
  save() {
    try { this.form.features = JSON.parse(this.featuresStr); } catch {}
    const req = this.editing() ? this.api.adminUpdatePlan(this.editing()!.id, this.form) : this.api.adminCreatePlan(this.form);
    req.subscribe(() => { this.load(); this.showModal.set(false); });
  }
}
