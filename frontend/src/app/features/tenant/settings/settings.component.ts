import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../../core/services/api.service";

@Component({ selector:"app-settings", standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header"><div><h1 class="page-title">Configurações</h1><p class="page-sub">Dados da empresa e notificações</p></div></div>
  <div class="grid-2">
    <div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:16px">🏢 Dados da empresa</div>
      <div class="form-group"><label>Nome da empresa</label><input [(ngModel)]="profile.company_name"/></div>
      <div class="row-2">
        <div class="form-group"><label>CNPJ</label><input [(ngModel)]="profile.cnpj" placeholder="00.000.000/0001-00"/></div>
        <div class="form-group"><label>Telefone</label><input [(ngModel)]="profile.phone" placeholder="(11) 99999-9999"/></div>
      </div>
      @if (savedProfile()) { <div style="color:var(--primary);font-size:12px;margin-bottom:10px">✅ Salvo com sucesso!</div> }
      <button class="btn primary" (click)="saveProfile()" [disabled]="savingProfile()">{{ savingProfile() ? "Salvando..." : "Salvar" }}</button>
    </div>

    <div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:16px">🔔 Notificações</div>
      <div class="form-group"><label>Token do Telegram Bot</label><input type="password" [(ngModel)]="cfg.telegram_token" placeholder="123456:ABC-DEF..."/><small>Crie um bot em &#64;BotFather</small></div>
      <div class="form-group"><label>Chat ID (Telegram)</label><input [(ngModel)]="cfg.telegram_chat_id" placeholder="-100123456789"/></div>
      <div class="form-group"><label>E-mail de alertas</label><input type="email" [(ngModel)]="cfg.alert_email" placeholder="ops&#64;empresa.com"/></div>
      <div class="form-group"><label>WhatsApp</label><input [(ngModel)]="cfg.whatsapp_number" placeholder="+55 11 99999-9999"/></div>
      @if (savedCfg()) { <div style="color:var(--primary);font-size:12px;margin-bottom:10px">✅ Salvo com sucesso!</div> }
      <button class="btn primary" (click)="saveCfg()" [disabled]="savingCfg()">{{ savingCfg() ? "Salvando..." : "Salvar configurações" }}</button>
    </div>
  </div>

  <div class="card">
    <div style="font-size:14px;font-weight:600;margin-bottom:12px">🔑 Alterar senha</div>
    <div style="max-width:360px;display:flex;flex-direction:column;gap:0">
      <div class="form-group"><label>Senha atual</label><input type="password" [(ngModel)]="pwd.old_password"/></div>
      <div class="form-group"><label>Nova senha</label><input type="password" [(ngModel)]="pwd.new_password" placeholder="Mínimo 6 caracteres"/></div>
    </div>
    @if (pwdMsg()) { <div [style.color]="pwdErr() ? 'var(--critical)' : 'var(--primary)'" style="font-size:12px;margin-bottom:10px">{{ pwdMsg() }}</div> }
    <button class="btn primary" (click)="changePwd()">Alterar senha</button>
  </div>
</div>
`})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  profile: any = {}; cfg: any = {};
  pwd: any = {};
  savingProfile = signal(false); savedProfile = signal(false);
  savingCfg = signal(false);     savedCfg = signal(false);
  pwdMsg = signal(""); pwdErr = signal(false);
  ngOnInit() {
    this.api.getProfile().subscribe(p => this.profile = {...p});
    this.api.getSettings().subscribe(c => this.cfg = {...c});
  }
  saveProfile() {
    this.savingProfile.set(true);
    this.api.updateProfile({company_name:this.profile.company_name, cnpj:this.profile.cnpj, phone:this.profile.phone}).subscribe(()=>{ this.savingProfile.set(false); this.savedProfile.set(true); setTimeout(()=>this.savedProfile.set(false),3000); });
  }
  saveCfg() {
    this.savingCfg.set(true);
    this.api.updateSettings(this.cfg).subscribe(()=>{ this.savingCfg.set(false); this.savedCfg.set(true); setTimeout(()=>this.savedCfg.set(false),3000); });
  }
  changePwd() {
    this.api.changePassword(this.pwd.old_password, this.pwd.new_password).subscribe({
      next:()=>{ this.pwdMsg.set("Senha alterada com sucesso!"); this.pwdErr.set(false); this.pwd={}; },
      error:()=>{ this.pwdMsg.set("Erro ao alterar senha. Verifique a senha atual."); this.pwdErr.set(true); }
    });
  }
}
