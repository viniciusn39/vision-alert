import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

@Component({ selector:'app-locations', standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Estabelecimentos</h1>
      <p class="page-sub">{{ locations().length }} unidade(s) cadastrada(s)</p>
    </div>
    <button class="btn primary" (click)="openModal()">+ Adicionar estabelecimento</button>
  </div>

  @if (loading()) {
    <div class="loading"><div class="spinner"></div></div>
  } @else if (!locations().length) {
    <div class="empty">
      <div class="empty-icon">🏪</div>
      <h3>Nenhum estabelecimento cadastrado</h3>
      <p>Cadastre suas unidades para cruzar dados de múltiplas câmeras</p>
      <button class="btn primary" (click)="openModal()">Cadastrar primeiro estabelecimento</button>
    </div>
  } @else {
    <div class="loc-grid">
      @for (loc of locations(); track loc.id) {
        <div class="loc-card" (click)="openStats(loc)">
          <div class="loc-header">
            <div class="loc-icon">🏪</div>
            <div style="flex:1;min-width:0">
              <div class="loc-name">{{ loc.name }}</div>
              <div class="loc-addr">{{ loc.city }}{{ loc.state ? ', '+loc.state : '' }}</div>
            </div>
            <div style="display:flex;gap:6px" (click)="$event.stopPropagation()">
              <button class="btn sm ghost" (click)="openModal(loc)">✎</button>
              <button class="btn sm ghost" style="color:var(--critical)" (click)="confirmDelete(loc)">✕</button>
            </div>
          </div>
          <div class="loc-stats">
            <div class="ls-item">
              <div class="ls-val" style="color:var(--primary)">{{ loc.entries_today || 0 }}</div>
              <div class="ls-label">Entradas hoje</div>
            </div>
            <div class="ls-item">
              <div class="ls-val" style="color:#9333ea">{{ loc.inside_now || 0 }}</div>
              <div class="ls-label">Dentro agora</div>
            </div>
            <div class="ls-item">
              <div class="ls-val">{{ loc.camera_count || 0 }}</div>
              <div class="ls-label">Câmeras</div>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">
            @for (cam of getCameras(loc.id); track cam.id) {
              <span class="cam-tag">
                <span class="cam-dot" [style.background]="cam.status==='online' ? 'var(--primary)' : '#cbd5e1'"></span>
                {{ cam.name }}
              </span>
            }
            @if (!getCameras(loc.id).length) {
              <span style="font-size:11px;color:var(--hint)">Nenhuma câmera vinculada</span>
            }
          </div>
        </div>
      }
    </div>
  }
</div>

<!-- Add/Edit Modal -->
@if (showModal()) {
  <div class="modal-backdrop" (click)="showModal.set(false)">
    <div class="modal" style="max-width:520px" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h3>{{ editing() ? 'Editar' : 'Novo' }} estabelecimento</h3>
        <button class="btn ghost sm" (click)="showModal.set(false)">✕</button>
      </div>
      <div class="form-group"><label>Nome *</label><input [(ngModel)]="form.name" placeholder="Ex: Loja Centro"/></div>
      <div class="row-2">
        <div class="form-group"><label>Endereço</label><input [(ngModel)]="form.address" placeholder="Rua, número"/></div>
        <div class="form-group"><label>Cidade</label><input [(ngModel)]="form.city" placeholder="São Paulo"/></div>
      </div>
      <div class="row-2">
        <div class="form-group">
          <label>Estado</label>
          <select [(ngModel)]="form.state">
            <option value="">Selecione...</option>
            @for (s of states; track s.value) {
              <option [value]="s.value">{{ s.label }}</option>
            }
          </select>
        </div>
        <div class="form-group"><label>Fuso horário</label>
          <select [(ngModel)]="form.timezone">
            <option value="America/Sao_Paulo">Brasília (UTC-3)</option>
            <option value="America/Manaus">Manaus (UTC-4)</option>
            <option value="America/Belem">Belém (UTC-3)</option>
            <option value="America/Fortaleza">Fortaleza (UTC-3)</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Câmeras vinculadas</label>
        <div class="cam-checkboxes">
          @for (cam of allCameras(); track cam.id) {
            <label class="cam-check-item" [class.selected]="selCams.includes(cam.id)">
              <input type="checkbox" [checked]="selCams.includes(cam.id)" (change)="toggleCam(cam.id, $any($event.target).checked)" style="display:none"/>
              <span class="cam-check-dot" [class]="'ccd-'+cam.status"></span>
              <div><div style="font-size:12px;font-weight:500">{{ cam.name }}</div><div style="font-size:10px;color:var(--muted)">{{ cam.location }}</div></div>
            </label>
          }
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn" (click)="showModal.set(false)">Cancelar</button>
        <button class="btn primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
          {{ saving() ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- Stats Modal -->
@if (statsLoc()) {
  <div class="modal-backdrop" (click)="statsLoc.set(null)">
    <div class="modal" style="max-width:800px" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:48px;height:48px;border-radius:14px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏪</div>
          <div>
            <h3 style="margin:0">{{ statsLoc()!.name }}</h3>
            <p style="font-size:12px;color:var(--muted);margin:2px 0 0">{{ statsLoc()!.city }}{{ statsLoc()!.state ? ' · ' + statsLoc()!.state : '' }} · {{ statsLoc()!.camera_count }} câmera(s)</p>
          </div>
        </div>
        <button class="btn ghost sm" (click)="statsLoc.set(null)" style="font-size:18px">✕</button>
      </div>

      <!-- KPI row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
        <div class="stat-kpi" style="border-color:rgba(29,158,117,.2)">
          <div class="sk-icon" style="background:rgba(29,158,117,.1);color:var(--primary)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7"/></svg>
          </div>
          <div class="sk-val" style="color:var(--primary)">{{ statsLoc()!.entries_today||0 }}</div>
          <div class="sk-label">Entradas hoje</div>
        </div>
        <div class="stat-kpi" style="border-color:rgba(147,51,234,.2)">
          <div class="sk-icon" style="background:rgba(147,51,234,.1);color:#9333ea">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
          </div>
          <div class="sk-val" style="color:#9333ea">{{ statsLoc()!.inside_now||0 }}</div>
          <div class="sk-label">Dentro agora</div>
        </div>
        <div class="stat-kpi" style="border-color:rgba(245,158,11,.2)">
          <div class="sk-icon" style="background:rgba(245,158,11,.1);color:var(--high)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H3v-6M10 14l-7 7M15 3h6v6M14 10l7-7"/></svg>
          </div>
          <div class="sk-val" style="color:var(--high)">{{ statsLoc()!.exits_today||0 }}</div>
          <div class="sk-label">Saídas hoje</div>
        </div>
        <div class="stat-kpi">
          <div class="sk-icon" style="background:var(--bg);color:var(--muted)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
          </div>
          <div class="sk-val">{{ statsLoc()!.camera_count||0 }}</div>
          <div class="sk-label">Câmeras ativas</div>
        </div>
      </div>

      @if (statsLoading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (statsData()) {
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <!-- Daily chart -->
          <div class="stats-chart-card">
            <div class="scc-header">
              <span class="scc-title">Visitantes — 30 dias</span>
              <span class="scc-total">Total: {{ totalVisitors() }}</span>
            </div>
            <div class="chart-bars" style="height:130px">
              @for (d of statsData()!.daily; track d.date) {
                <div class="bar-col">
                  <div class="bar-val" [style.height.%]="dailyPct(d.entries)" style="background:var(--primary);opacity:.7;border-radius:3px 3px 0 0">
                    @if (d.entries > 0) { <span class="bar-tip" style="color:var(--primary)">{{ d.entries }}</span> }
                  </div>
                  <div class="bar-label">{{ d.date.slice(5) }}</div>
                </div>
              }
              @if (!statsData()!.daily.length) {
                <div style="width:100%;display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:8px">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--hint)" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  <span style="font-size:12px;color:var(--hint)">Sem dados ainda</span>
                </div>
              }
            </div>
          </div>

          <!-- Hourly chart -->
          <div class="stats-chart-card">
            <div class="scc-header">
              <span class="scc-title">Fluxo por hora — hoje</span>
              @if (peakHour() !== null) {
                <span class="scc-total">Pico: {{ peakHour() }}h</span>
              }
            </div>
            <div class="chart-bars" style="height:130px">
              @for (h of hourlyFull(); track h.hour) {
                <div class="bar-col">
                  <div class="bar-val" [style.height.%]="hourlyPct(h.avg)"
                    [style.background]="h.isPeak ? '#9333ea' : 'rgba(147,51,234,.35)'"
                    style="border-radius:3px 3px 0 0">
                  </div>
                  <div class="bar-label" [style.color]="h.isPeak ? '#9333ea' : ''">{{ h.hour }}</div>
                </div>
              }
              @if (!statsData()!.hourly.length) {
                <div style="width:100%;display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:8px">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--hint)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                  <span style="font-size:12px;color:var(--hint)">Sem dados hoje</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Cameras breakdown -->
        @if (getCameras(statsLoc()!.id).length) {
          <div style="margin-top:16px">
            <div class="scc-title" style="margin-bottom:10px">Câmeras vinculadas</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              @for (cam of getCameras(statsLoc()!.id); track cam.id) {
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm)">
                  <div style="width:7px;height:7px;border-radius:50%" [style.background]="cam.status==='online' ? 'var(--primary)' : '#cbd5e1'"></div>
                  <span style="font-size:12px;font-weight:500">{{ cam.name }}</span>
                  <span style="font-size:10px;color:var(--muted)">{{ cam.protocol?.toUpperCase() }}</span>
                </div>
              }
            </div>
          </div>
        }
      }

      <div class="modal-footer" style="margin-top:20px;border-top:1px solid var(--border);padding-top:14px">
        <span style="font-size:12px;color:var(--hint)">Atualizado agora</span>
        <button class="btn sm primary" (click)="statsLoc.set(null)">Fechar</button>
      </div>
    </div>
  </div>
}

<!-- Delete confirm -->
@if (toDelete()) {
  <div class="modal-backdrop" (click)="toDelete.set(null)">
    <div class="modal" style="max-width:400px;text-align:center" (click)="$event.stopPropagation()">
      <div style="font-size:40px;margin-bottom:12px">🗑️</div>
      <h3>Excluir estabelecimento?</h3>
      <p style="font-size:13px;color:var(--muted);margin:8px 0 20px">Esta ação não pode ser desfeita.</p>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn" (click)="toDelete.set(null)">Cancelar</button>
        <button class="btn critical" (click)="remove()">Excluir</button>
      </div>
    </div>
  </div>
}
`, styles:[`
.loc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.loc-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;cursor:pointer;transition:all .2s;box-shadow:var(--shadow-sm);&:hover{box-shadow:var(--shadow);transform:translateY(-2px)}}
.loc-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
.loc-icon{width:44px;height:44px;border-radius:12px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.loc-name{font-size:15px;font-weight:700}
.loc-addr{font-size:12px;color:var(--muted);margin-top:2px}
.loc-stats{display:flex;gap:0;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden}
.ls-item{flex:1;padding:12px;text-align:center;border-right:1px solid var(--border);&:last-child{border:none}}
.ls-val{font-size:22px;font-weight:800;letter-spacing:-1px}
.ls-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-top:2px}
.cam-tag{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:99px;background:var(--bg);border:1px solid var(--border);font-size:11px;font-weight:500}
.cam-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.chart-bars{display:flex;align-items:flex-end;gap:2px;padding-top:8px}
.stat-kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.sk-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sk-val{font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1}
.sk-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}
.stats-chart-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px 16px}
.scc-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.scc-title{font-size:12px;font-weight:600;color:var(--text)}
.scc-total{font-size:11px;font-weight:600;color:var(--primary);background:var(--primary-light);padding:2px 8px;border-radius:99px}
.bar-col{display:flex;flex-direction:column;align-items:center;flex:1;height:100%;gap:2px}
.bar-val{flex:1;width:100%;min-height:3px;border-radius:3px 3px 0 0;position:relative;transition:height .3s}
.bar-tip{position:absolute;top:-16px;font-size:9px;font-weight:700;color:var(--primary);white-space:nowrap}
.bar-label{font-size:9px;color:var(--hint);white-space:nowrap}
.cam-checkboxes{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.cam-check-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;transition:all .15s;&:hover{border-color:var(--primary)}}
.cam-check-item.selected{border-color:var(--primary);background:var(--primary-light)}
.cam-check-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.ccd-online{background:var(--primary)}.ccd-offline{background:#cbd5e1}
`]})
export class LocationsComponent implements OnInit {
  private api = inject(ApiService);
  locations   = signal<any[]>([]);
  allCameras  = signal<any[]>([]);
  loading     = signal(true);
  showModal   = signal(false);
  editing     = signal<any>(null);
  saving      = signal(false);
  toDelete    = signal<any>(null);
  statsLoc    = signal<any>(null);
  statsData   = signal<any>(null);
  statsLoading = signal(false);
  form: any   = {};
  states = [
    {value:'AC',label:'AC — Acre'},{value:'AL',label:'AL — Alagoas'},{value:'AP',label:'AP — Amapá'},
    {value:'AM',label:'AM — Amazonas'},{value:'BA',label:'BA — Bahia'},{value:'CE',label:'CE — Ceará'},
    {value:'DF',label:'DF — Distrito Federal'},{value:'ES',label:'ES — Espírito Santo'},
    {value:'GO',label:'GO — Goiás'},{value:'MA',label:'MA — Maranhão'},{value:'MT',label:'MT — Mato Grosso'},
    {value:'MS',label:'MS — Mato Grosso do Sul'},{value:'MG',label:'MG — Minas Gerais'},
    {value:'PA',label:'PA — Pará'},{value:'PB',label:'PB — Paraíba'},{value:'PR',label:'PR — Paraná'},
    {value:'PE',label:'PE — Pernambuco'},{value:'PI',label:'PI — Piauí'},{value:'RJ',label:'RJ — Rio de Janeiro'},
    {value:'RN',label:'RN — Rio Grande do Norte'},{value:'RS',label:'RS — Rio Grande do Sul'},
    {value:'RO',label:'RO — Rondônia'},{value:'RR',label:'RR — Roraima'},{value:'SC',label:'SC — Santa Catarina'},
    {value:'SP',label:'SP — São Paulo'},{value:'SE',label:'SE — Sergipe'},{value:'TO',label:'TO — Tocantins'},
  ];
  selCams: number[] = [];

  ngOnInit() {
    this.api.getLocations().subscribe({ next: (r: any) => { this.locations.set(Array.isArray(r) ? r : (r.results ?? [])); this.loading.set(false); }, error: () => this.loading.set(false) });
    this.api.getCameras().subscribe(c => this.allCameras.set(c));
  }

  getCameras(locId: number) {
    return this.allCameras().filter((c: any) => c.location_obj === locId);
  }

  openModal(loc?: any) {
    this.editing.set(loc || null);
    this.form = loc ? {...loc} : { name:'', address:'', city:'', state:'', timezone:'America/Sao_Paulo' };
    this.selCams = this.getCameras(loc?.id).map((c: any) => c.id);
    this.showModal.set(true);
  }

  toggleCam(id: number, on: boolean) {
    if (on) { if (!this.selCams.includes(id)) this.selCams = [...this.selCams, id]; }
    else    { this.selCams = this.selCams.filter(x => x !== id); }
  }

  save() {
    if (!this.form.name) return;
    this.saving.set(true);
    const req = this.editing()
      ? this.api.updateLocation(this.editing().id, this.form)
      : this.api.createLocation(this.form);
    req.subscribe({
      next: (loc: any) => {
        const allCams = this.allCameras();
        // Cameras to assign to this location
        const toAssign = this.selCams;
        // Cameras previously in this location but now removed
        const toRemove = allCams
          .filter((c: any) => c.location_obj === loc.id && !toAssign.includes(c.id))
          .map((c: any) => c.id);

        const updates = [
          ...toAssign.map(cid => this.api.updateCamera(cid, { location_obj: loc.id })),
          ...toRemove.map(cid => this.api.updateCamera(cid, { location_obj: null }))
        ];

        if (updates.length) {
          let done = 0;
          updates.forEach(req => req.subscribe({ next: () => {
            done++;
            if (done === updates.length) {
              // Reload all after updates complete
              this.api.getCameras().subscribe(cams => this.allCameras.set(cams));
              this.api.getLocations().subscribe((r: any) => this.locations.set(Array.isArray(r) ? r : (r.results ?? [])));
            }
          }}));
        } else {
          this.api.getCameras().subscribe(cams => this.allCameras.set(cams));
          this.api.getLocations().subscribe((r: any) => this.locations.set(Array.isArray(r) ? r : (r.results ?? [])));
        }
        this.showModal.set(false);
        this.saving.set(false);
        // If creating new, open edit to assign cameras
        if (!this.editing()) {
          setTimeout(() => this.openModal(loc), 300);
        }
      },
      error: () => this.saving.set(false)
    });
  }

  confirmDelete(loc: any) { this.toDelete.set(loc); }
  remove() {
    this.api.deleteLocation(this.toDelete()!.id).subscribe(() => {
      this.locations.update(l => l.filter(x => x.id !== this.toDelete()!.id));
      this.toDelete.set(null);
    });
  }

  openStats(loc: any) {
    this.statsLoc.set(loc);
    this.statsData.set({ daily: [], hourly: [] });
    this.statsLoading.set(true);
    this.api.getLocationStats(loc.id).subscribe({
      next: d => { this.statsData.set(d); this.statsLoading.set(false); },
      error: () => { this.statsData.set({ daily: [], hourly: [] }); this.statsLoading.set(false); }
    });
  }

  dailyPct(v: number): number {
    const max = Math.max(...(this.statsData()?.daily?.map((d: any) => d.entries) ?? [1]), 1);
    return Math.max(4, (v/max)*100);
  }
  hourlyPct(v: number): number {
    const max = Math.max(...(this.statsData()?.hourly?.map((h: any) => h.avg) ?? [1]), 1);
    return Math.max(4, (v/max)*100);
  }
  totalVisitors(): number {
    return (this.statsData()?.daily ?? []).reduce((s: number, d: any) => s + (d.entries||0), 0);
  }
  peakHour(): number | null {
    const h = this.statsData()?.hourly ?? [];
    if (!h.length) return null;
    return h.reduce((best: any, cur: any) => cur.avg > best.avg ? cur : best).hour;
  }
  hourlyFull() {
    const data = this.statsData()?.hourly ?? [];
    const peak = this.peakHour();
    const map: Record<number,number> = {};
    data.forEach((h: any) => map[h.hour] = h.avg);
    return Array.from({length: 24}, (_, i) => ({hour: i, avg: map[i] ?? 0, isPeak: i === peak}));
  }
}
