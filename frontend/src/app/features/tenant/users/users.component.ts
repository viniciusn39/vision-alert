import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";
import { User } from "../../../core/models/models";

const ROLES = [
  { value:"tenant_admin",    label:"Admin",        color:"#7c3aed", bg:"#f3e8ff", desc:"Acesso total ao sistema" },
  { value:"tenant_operator", label:"Operador",     color:"#2563EB", bg:"#eff6ff", desc:"Gerencia câmeras e alertas" },
  { value:"tenant_viewer",   label:"Visualizador", color:"#059669", bg:"#ecfdf5", desc:"Somente leitura" },
];

@Component({ selector:"app-users", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Usuários</h1>
      <p class="page-sub">{{ users().length }} usuário{{ users().length !== 1 ? 's' : '' }}</p>
    </div>
    <button class="btn primary" (click)="openModal()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Novo usuário
    </button>
  </div>

  @if (users().length === 0) {
    <div class="empty">
      <div class="empty-icon">👥</div>
      <h4>Nenhum usuário</h4>
      <p>Adicione usuários para dar acesso ao sistema</p>
      <button class="btn primary" style="margin-top:20px" (click)="openModal()">+ Adicionar usuário</button>
    </div>
  } @else {
    <div class="table-card">
      <table class="dt">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Status</th>
            <th>Criado em</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (u of users(); track u.id) {
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="user-av" [style.background]="roleColor(u.role)+'22'" [style.color]="roleColor(u.role)">{{ initials(u.name) }}</div>
                  <span style="font-weight:600;font-size:13px">{{ u.name }}</span>
                </div>
              </td>
              <td style="font-size:12px;color:var(--muted)">{{ u.email }}</td>
              <td>
                <span class="role-tag" [style.background]="roleColor(u.role)+'18'" [style.color]="roleColor(u.role)">
                  {{ roleLabel(u.role) }}
                </span>
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="status-dot" [class.sdot-on]="u.is_active" [class.sdot-off]="!u.is_active"></span>
                  <span style="font-size:12px;font-weight:500" [style.color]="u.is_active ? 'var(--primary)' : 'var(--muted)'">
                    {{ u.is_active ? 'Ativo' : 'Inativo' }}
                  </span>
                </div>
              </td>
              <td style="font-size:12px;color:var(--muted)">{{ fmtDate(u.created_at) }}</td>
              <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                  <button class="tbl-btn tbl-edit" (click)="openModal(u)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editar
                  </button>
                  <button class="tbl-icon tbl-del" (click)="confirmDelete(u)">
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

<!-- Delete modal -->
@if (userToDelete()) {
  <div class="modal-backdrop" (click)="userToDelete.set(null)">
    <div class="modal" style="max-width:400px" (click)="$event.stopPropagation()">
      <div style="text-align:center;padding:8px 0 20px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--critical-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--critical)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/></svg>
        </div>
        <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">Remover usuário?</h3>
        <p style="font-size:13px;color:var(--muted);line-height:1.5">
          Tem certeza que deseja remover <strong>{{ userToDelete()!.name }}</strong>?<br/>Esta ação não pode ser desfeita.
        </p>
      </div>
      <div class="modal-footer" style="justify-content:center;gap:12px">
        <button class="btn" style="min-width:100px" (click)="userToDelete.set(null)">Cancelar</button>
        <button class="btn danger" style="min-width:100px" (click)="remove()">Remover</button>
      </div>
    </div>
  </div>
}

<!-- Edit/Create modal -->
@if (showModal()) {
  <div class="modal-backdrop" (click)="closeModal($event)">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3>{{ editing() ? 'Editar usuário' : 'Novo usuário' }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">{{ editing() ? 'Altere os dados do usuário' : 'Preencha os dados para criar acesso' }}</p>
        </div>
        <button class="btn ghost sm" (click)="showModal.set(false)" style="font-size:16px;padding:4px 8px">✕</button>
      </div>

      <div class="row-2">
        <div class="form-group"><label>Nome *</label><input [(ngModel)]="form.name" placeholder="Nome completo"/></div>
        <div class="form-group">
          <label>E-mail *</label>
          <input type="email" [(ngModel)]="form.email" placeholder="usuario@empresa.com" [disabled]="!!editing()"/>
        </div>
      </div>

      <div class="form-group">
        <label>Perfil de acesso</label>
        <div class="role-selector">
          @for (r of roles; track r.value) {
            <div class="role-opt" [class.selected]="form.role === r.value" (click)="form.role = r.value"
                 [style.border-color]="form.role === r.value ? r.color : ''"
                 [style.background]="form.role === r.value ? r.bg : ''">
              <div class="ro-dot" [style.background]="r.color"></div>
              <div style="flex:1">
                <div class="ro-label">{{ r.label }}</div>
                <div class="ro-desc">{{ r.desc }}</div>
              </div>
              @if (form.role === r.value) {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" [style.stroke]="r.color" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
              }
            </div>
          }
        </div>
      </div>

      @if (!editing()) {
        <div class="form-group">
          <label>Senha *</label>
          <input type="password" [(ngModel)]="form.password" placeholder="Mínimo 6 caracteres"/>
        </div>
      }

      @if (error()) {
        <div style="background:#fff1f1;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:13px;color:#991b1b;margin-bottom:14px">{{ error() }}</div>
      }

      <div class="modal-footer">
        <button class="btn" (click)="showModal.set(false)">Cancelar</button>
        <button class="btn primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
          {{ saving() ? 'Salvando...' : editing() ? 'Salvar' : 'Criar usuário' }}
        </button>
      </div>
    </div>
  </div>
}
`, styles:[`
.user-av{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
.role-tag{padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700}
.status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.sdot-on{background:var(--primary)}.sdot-off{background:#cbd5e1}
.tbl-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:all .15s;&:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}}
.tbl-edit{color:var(--medium);border-color:rgba(59,130,246,.2);&:hover{background:var(--medium-bg);border-color:var(--medium)}}
.tbl-icon{width:30px;height:30px;border-radius:6px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;&:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}}
.tbl-del{color:var(--critical);&:hover{background:var(--critical-bg);border-color:rgba(226,75,74,.3)}}
.role-selector{display:flex;flex-direction:column;gap:6px}
.role-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--r-sm);cursor:pointer;transition:all .15s;&:hover{border-color:var(--primary)}}
.ro-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.ro-label{font-size:13px;font-weight:600}
.ro-desc{font-size:11px;color:var(--muted);margin-top:1px}
`]})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  roles = ROLES;
  users        = signal<User[]>([]);
  showModal    = signal(false);
  editing      = signal<User|null>(null);
  saving       = signal(false);
  error        = signal("");
  userToDelete = signal<User|null>(null);
  form: any    = {};

  ngOnInit() { this.load(); }
  load() { this.api.getUsers().subscribe((u: any) => this.users.set(Array.isArray(u) ? u : (u.results ?? []))); }

  roleLabel(r: string) { return ROLES.find(x => x.value === r)?.label ?? r; }
  roleColor(r: string) { return ROLES.find(x => x.value === r)?.color ?? "#666"; }
  initials(n: string)  { return (n||'').split(' ').slice(0,2).map(w=>w[0]??'').join('').toUpperCase()||'?'; }
  fmtDate(d: string)   { return new Date(d).toLocaleDateString("pt-BR"); }

  openModal(u?: User) {
    this.editing.set(u||null);
    this.form = u ? {...u} : { role:"tenant_operator" };
    this.error.set("");
    this.showModal.set(true);
  }
  closeModal(e: MouseEvent) { if (e.target === e.currentTarget) this.showModal.set(false); }

  save() {
    this.saving.set(true); this.error.set("");
    const req = this.editing()
      ? this.api.updateUser(this.editing()!.id, { name:this.form.name, role:this.form.role })
      : this.api.createUser(this.form);
    req.subscribe({
      next: () => { this.load(); this.showModal.set(false); this.saving.set(false); },
      error: (err:any) => { this.error.set(Object.values(err.error||{}).flat().join(" ")||"Erro ao salvar."); this.saving.set(false); }
    });
  }

  confirmDelete(u: User) { this.userToDelete.set(u); }
  remove() {
    const u = this.userToDelete();
    if (!u) return;
    this.api.deleteUser(u.id).subscribe(() => { this.load(); this.userToDelete.set(null); });
  }
}
