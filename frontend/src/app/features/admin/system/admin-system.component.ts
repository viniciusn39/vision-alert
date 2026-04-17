import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

@Component({ selector:'app-admin-system', standalone:true, imports:[CommonModule,FormsModule], template:`
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1 class="page-title">Configurações do Sistema</h1>
      <p class="page-sub">Parâmetros de processamento YOLO e Celery</p>
    </div>
    <button class="btn primary" (click)="save()" [disabled]="saving()">
      @if (saving()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
      {{ saving() ? 'Salvando...' : 'Salvar alterações' }}
    </button>
  </div>

  @if (saved()) {
    <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:var(--r-sm);padding:12px 16px;font-size:13px;color:#065f46;display:flex;align-items:center;gap:8px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
      Salvo! Novos valores aplicados no próximo frame processado.
    </div>
  }

  @if (loading()) {
    <div class="loading"><div class="spinner"></div></div>
  } @else {
    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">🤖 YOLO — Detecção de objetos</div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:20px">Afeta a qualidade e velocidade da análise de vídeo</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="config-item">
          <div class="config-header">
            <label class="config-label">FPS de análise</label>
            <span class="config-val-badge">{{ form['ANALYSIS_FPS'] }} fps</span>
          </div>
          <input type="range" [(ngModel)]="form['ANALYSIS_FPS']" min="0.1" max="5" step="0.1" class="range-input"/>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint);margin-top:4px">
            <span>0.1 (econômico)</span><span>5 (máximo)</span>
          </div>
          <small>Frames por segundo enviados para análise YOLO.</small>
          <div class="config-presets">
            <span>Presets:</span>
            <button class="preset-btn" (click)="set('ANALYSIS_FPS', 0.1)">Econômico</button>
            <button class="preset-btn" (click)="set('ANALYSIS_FPS', 1)">Balanceado</button>
            <button class="preset-btn" (click)="set('ANALYSIS_FPS', 2)">Normal</button>
            <button class="preset-btn" (click)="set('ANALYSIS_FPS', 5)">Máximo</button>
          </div>
        </div>
        <div class="config-item">
          <div class="config-header">
            <label class="config-label">Confiança mínima</label>
            <span class="config-val-badge">{{ (+form['DETECTION_CONFIDENCE'] * 100).toFixed(0) }}%</span>
          </div>
          <input type="range" [(ngModel)]="form['DETECTION_CONFIDENCE']" min="0.1" max="0.9" step="0.05" class="range-input"/>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint);margin-top:4px">
            <span>10% (mais detecções)</span><span>90% (mais preciso)</span>
          </div>
          <small>Confiança mínima para considerar uma detecção válida.</small>
          <div class="config-presets">
            <span>Presets:</span>
            <button class="preset-btn" (click)="set('DETECTION_CONFIDENCE', 0.3)">Sensível 30%</button>
            <button class="preset-btn" (click)="set('DETECTION_CONFIDENCE', 0.5)">Normal 50%</button>
            <button class="preset-btn" (click)="set('DETECTION_CONFIDENCE', 0.7)">Estrito 70%</button>
          </div>
        </div>
      </div>
      <div class="config-item" style="margin-top:16px">
        <div class="config-header">
          <label class="config-label">Modelo YOLO</label>
          <span class="config-val-badge">{{ form['YOLO_MODEL'] }}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
          @for (m of yoloModels; track m.value) {
            <div class="model-card" [class.model-selected]="form['YOLO_MODEL']===m.value" (click)="set('YOLO_MODEL', m.value)">
              <div style="font-size:13px;font-weight:600">{{ m.label }}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">{{ m.desc }}</div>
              <div class="speed-bar">
                @for (i of [1,2,3]; track i) {
                  <div class="speed-seg" [style.background]="i <= m.speed ? 'var(--primary)' : '#e2e8f0'"></div>
                }
                <span style="font-size:10px;color:var(--muted)">{{ m.speedLabel }}</span>
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">⚙️ Workers Celery</div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:16px">Processamento paralelo de frames</p>
      <div class="config-item">
        <div class="config-header">
          <label class="config-label">Workers paralelos</label>
          <span class="config-val-badge">{{ form['CELERY_WORKERS'] }} workers</span>
        </div>
        <input type="range" [(ngModel)]="form['CELERY_WORKERS']" min="1" max="16" step="1" class="range-input"/>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint);margin-top:4px">
          <span>1</span><span>16</span>
        </div>
        <small>⚠️ Requer <code>docker compose restart celery_worker</code> para aplicar.</small>
        <div class="config-presets">
          <button class="preset-btn" (click)="set('CELERY_WORKERS', 2)">Leve (2)</button>
          <button class="preset-btn" (click)="set('CELERY_WORKERS', 4)">Normal (4)</button>
          <button class="preset-btn" (click)="set('CELERY_WORKERS', 8)">Alto (8)</button>
        </div>
      </div>
    </div>

    <div class="card" style="background:var(--bg);border-style:dashed">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">ℹ️ Como aplicar</div>
      <div style="font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:6px">
        <div>• <strong>FPS e Confiança</strong> — aplicados no próximo frame após salvar</div>
        <div>• <strong>Modelo YOLO</strong> — requer restart do worker</div>
        <div>• <strong>Workers</strong> — requer restart do worker</div>
      </div>
      <code style="display:block;margin-top:10px;padding:10px;background:var(--surface);border-radius:6px;font-size:12px">docker compose restart celery_worker</code>
    </div>
  }
</div>
`, styles:[`
.config-item{padding:16px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)}
.config-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.config-label{font-size:13px;font-weight:600}
.config-val-badge{background:var(--primary-light);color:var(--primary);font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px}
.range-input{width:100%;accent-color:var(--primary);margin:4px 0}
.config-presets{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--muted)}
.preset-btn{padding:3px 10px;border-radius:99px;border:1px solid var(--border);background:var(--surface);font-size:11px;font-weight:500;cursor:pointer;transition:all .15s;&:hover{border-color:var(--primary);color:var(--primary);background:var(--primary-light)}}
.model-card{border:2px solid var(--border);border-radius:var(--r-sm);padding:12px;cursor:pointer;transition:all .15s;&:hover{border-color:var(--primary)}}
.model-card.model-selected{border-color:var(--primary);background:var(--primary-light)}
.speed-bar{display:flex;align-items:center;gap:3px;margin-top:8px}
.speed-seg{width:16px;height:4px;border-radius:99px}
`]})
export class AdminSystemComponent implements OnInit {
  private api = inject(ApiService);
  loading = signal(true);
  saving  = signal(false);
  saved   = signal(false);
  form: Record<string,any> = {
    ANALYSIS_FPS: 1,
    DETECTION_CONFIDENCE: 0.5,
    YOLO_MODEL: 'yolov8n.pt',
    CELERY_WORKERS: 4,
  };
  yoloModels = [
    { value:'yolov8n.pt', label:'Nano (n)',   desc:'Rápido, menor precisão',  speed:3, speedLabel:'Rápido' },
    { value:'yolov8s.pt', label:'Small (s)',  desc:'Balanceado (recomendado)', speed:2, speedLabel:'Médio'  },
    { value:'yolov8m.pt', label:'Medium (m)', desc:'Preciso, mais lento',      speed:1, speedLabel:'Lento'  },
  ];
  ngOnInit() {
    this.api.getSystemConfig().subscribe({
      next: (configs: any[]) => {
        configs.forEach((c: any) => {
          if (c.value_type === 'int')        this.form[c.key] = parseInt(c.value);
          else if (c.value_type === 'float') this.form[c.key] = parseFloat(c.value);
          else                               this.form[c.key] = c.value;
        });
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
  set(key: string, value: any) { this.form[key] = value; }
  save() {
    this.saving.set(true);
    this.api.updateSystemConfig(this.form).subscribe({
      next: () => { this.saving.set(false); this.saved.set(true); setTimeout(() => this.saved.set(false), 4000); },
      error: () => this.saving.set(false)
    });
  }
}
