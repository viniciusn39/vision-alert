import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { Plan } from '../../../core/models/models';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, CommonModule],
  template: `
    <div class="auth-page">
      <div class="reg-card">
        <div class="brand"><div class="brand-dot"></div><span>VisionAlert</span></div>
        <h2>Criar conta grátis</h2>
        <p class="auth-sub">30 dias de trial sem cartão de crédito</p>

        @if (step() === 1) {
          <div class="step-label">Passo 1 de 2 — Escolha seu plano</div>
          <div class="plans-grid">
            @for (plan of plans(); track plan.id) {
              <div class="plan-card" [class.selected]="selectedPlan()?.id === plan.id" (click)="selectedPlan.set(plan)">
                <div class="plan-name">{{ plan.display_name }}</div>
                <div class="plan-price">
                  @if (plan.price == 0) { <span class="free">Grátis</span> }
                  @else { <span>R$ {{ plan.price }}<small>/mês</small></span> }
                </div>
                <ul class="plan-features">
                  <li>{{ plan.max_cameras }} câmera{{ plan.max_cameras > 1 ? 's' : '' }}</li>
                  <li>{{ plan.max_users }} usuário{{ plan.max_users > 1 ? 's' : '' }}</li>
                  <li>{{ plan.max_rules }} regra{{ plan.max_rules > 1 ? 's' : '' }}</li>
                  @if (plan.features['ai_vision']) { <li>✨ Claude Vision IA</li> }
                </ul>
              </div>
            }
          </div>
          <button class="btn primary" style="width:100%;justify-content:center;margin-top:16px"
            (click)="step.set(2)" [disabled]="!selectedPlan()">
            Continuar com {{ selectedPlan()?.display_name || 'plano selecionado' }}
          </button>
        }

        @if (step() === 2) {
          <div class="step-label">Passo 2 de 2 — Dados da conta</div>
          <form (ngSubmit)="submit()">
            <div class="form-group">
              <label>Nome da empresa *</label>
              <input [(ngModel)]="form.company_name" name="company_name" placeholder="Minha Empresa Ltda" required />
            </div>
            <div class="row-2">
              <div class="form-group">
                <label>CNPJ</label>
                <input [(ngModel)]="form.cnpj" name="cnpj" placeholder="00.000.000/0001-00" />
              </div>
              <div class="form-group">
                <label>Telefone</label>
                <input [(ngModel)]="form.phone" name="phone" placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div class="form-group">
              <label>E-mail da empresa *</label>
              <input type="email" [(ngModel)]="form.email" name="email" placeholder="contato&#64;empresa.com" required />
            </div>
            <div class="divider">Dados de acesso do administrador</div>
            <div class="form-group">
              <label>Seu nome *</label>
              <input [(ngModel)]="form.admin_name" name="admin_name" placeholder="João Silva" required />
            </div>
            <div class="form-group">
              <label>Seu e-mail (login) *</label>
              <input type="email" [(ngModel)]="form.admin_email" name="admin_email" placeholder="joao&#64;empresa.com" required />
            </div>
            <div class="form-group">
              <label>Senha *</label>
              <input type="password" [(ngModel)]="form.admin_password" name="admin_password" placeholder="Mínimo 6 caracteres" required />
            </div>
            <div class="form-group">
              <label>Código de revenda (opcional)</label>
              <input [(ngModel)]="form.partner_code" name="partner_code" placeholder="E-mail do seu parceiro" />
            </div>
            @if (error()) {
              <div class="auth-error">{{ error() }}</div>
            }
            @if (success()) {
              <div class="auth-success">✅ Conta criada! Redirecionando para o login...</div>
            }
            <div style="display:flex;gap:8px">
              <button type="button" class="btn" (click)="step.set(1)">← Voltar</button>
              <button type="submit" class="btn primary" style="flex:1;justify-content:center" [disabled]="loading()">
                @if (loading()) { <div class="spinner" style="width:16px;height:16px;border-width:2px"></div> }
                @else { Criar conta grátis }
              </button>
            </div>
          </form>
        }

        <div class="auth-footer">Já tem conta? <a routerLink="/login">Entrar</a></div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#f0fdf4,#f9fafb); padding:20px; }
    .reg-card { background:#fff; border:1px solid var(--border); border-radius:var(--r); padding:40px; width:100%; max-width:520px; box-shadow:0 10px 40px rgba(0,0,0,.08); }
    .brand { display:flex; align-items:center; gap:10px; font-size:20px; font-weight:700; margin-bottom:16px; .brand-dot { width:12px; height:12px; border-radius:50%; background:var(--primary); } }
    h2 { font-size:18px; font-weight:600; margin-bottom:4px; }
    .auth-sub { font-size:13px; color:var(--muted); margin-bottom:20px; }
    .step-label { font-size:12px; font-weight:500; color:var(--muted); margin-bottom:16px; }
    .plans-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .plan-card { border:2px solid var(--border); border-radius:var(--r); padding:16px; cursor:pointer; transition:all .15s;
      &:hover { border-color: var(--primary); }
      &.selected { border-color:var(--primary); background:var(--primary-light); }
      .plan-name  { font-weight:600; font-size:14px; margin-bottom:4px; }
      .plan-price { font-size:20px; font-weight:700; margin-bottom:10px; color:var(--primary);
        small { font-size:12px; font-weight:400; color:var(--muted); }
        .free { font-size:16px; }
      }
      .plan-features { list-style:none; font-size:12px; color:var(--muted); display:flex; flex-direction:column; gap:3px; }
    }
    .divider { font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin:16px 0 12px; padding-top:16px; border-top:1px solid var(--border); }
    .auth-error  { background:#fff0f0; border:1px solid #fecaca; border-radius:var(--r-sm); padding:10px 12px; font-size:13px; color:var(--critical-text); margin-bottom:14px; }
    .auth-success { background:#f0fdf4; border:1px solid #86efac; border-radius:var(--r-sm); padding:10px 12px; font-size:13px; color:#14532d; margin-bottom:14px; }
    .auth-footer { text-align:center; margin-top:20px; font-size:13px; color:var(--muted); a { color:var(--primary); font-weight:500; } }
  `]
})
export class RegisterComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  plans        = signal<Plan[]>([]);
  selectedPlan = signal<Plan | null>(null);
  step         = signal(1);
  loading      = signal(false);
  error        = signal('');
  success      = signal(false);

  form = { company_name:'', cnpj:'', phone:'', email:'', admin_name:'', admin_email:'', admin_password:'', partner_code:'' };

  ngOnInit() { this.api.getPlans().subscribe(p => this.plans.set(p)); }

  submit() {
    this.loading.set(true); this.error.set('');
    const payload = { ...this.form, plan_id: this.selectedPlan()!.id };
    this.api.register(payload).subscribe({
      next: (res: any) => {
        this.success.set(true);
        setTimeout(() => this.auth.login(this.form.admin_email, this.form.admin_password).subscribe({
          next: () => this.auth.redirectByRole()
        }), 1500);
      },
      error: (err) => {
        const msg = err.error ? Object.values(err.error).flat().join(' ') : 'Erro ao criar conta.';
        this.error.set(String(msg));
        this.loading.set(false);
      }
    });
  }
}
