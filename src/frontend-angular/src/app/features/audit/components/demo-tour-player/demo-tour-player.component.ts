import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DemoStep {
  duration: number; // میلی‌ثانیه
  subtitle: string;
  badgeText: string;
  action?: () => void;
  cursorPos?: { x: number; y: number; click?: boolean };
}

@Component({
  selector: 'app-demo-tour-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="demo-overlay-wrapper" *ngIf="isPlaying">
      <!-- نشانگر موس مجازی با افکت کلیک -->
      <div 
        class="virtual-cursor" 
        [style.left.px]="cursorX" 
        [style.top.px]="cursorY"
        [class.clicking]="isClicking">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L20 10L12 12L10 20L4 2Z" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
        <span class="click-pulse" *ngIf="isClicking"></span>
      </div>

      <!-- کادر زیرنویس و اطلاعات سینمایی پایین صفحه -->
      <div class="cinematic-hud">
        <div class="hud-header">
          <span class="rec-dot"></span>
          <span class="hud-phase">AUTONOMOUS DEMO: <strong>{{ currentBadge }}</strong></span>
          <button class="abort-btn" (click)="stopTour()">خروج از دمو (ESC)</button>
        </div>
        <div class="hud-caption">
          {{ currentSubtitle }}
        </div>
        <div class="progress-bar-container">
          <div class="progress-fill" [style.width.%]="progressPercent"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .demo-overlay-wrapper {
      position: fixed; inset: 0; pointer-events: none; z-index: 99999;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .virtual-cursor {
      position: absolute; width: 24px; height: 24px; z-index: 100000;
      transition: left 1.1s cubic-bezier(0.25, 1, 0.5, 1), top 1.1s cubic-bezier(0.25, 1, 0.5, 1);
      transform: translate(-2px, -2px);
    }
    .click-pulse {
      position: absolute; top: 0; left: 0; width: 24px; height: 24px;
      border-radius: 50%; background: rgba(56, 189, 248, 0.4);
      border: 2px solid #38bdf8; animation: pulseRing 0.5s ease-out forwards;
    }
    @keyframes pulseRing {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.8); opacity: 0; }
    }
    .cinematic-hud {
      position: absolute; bottom: 35px; left: 50%; transform: translateX(-50%);
      width: 780px; max-width: 90vw; background: rgba(8, 12, 20, 0.95);
      border: 1px solid #1e293b; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
      backdrop-filter: blur(8px); padding: 0.8rem 1.2rem; pointer-events: auto;
      direction: rtl; text-align: right;
    }
    .hud-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 0.4rem; font-size: 0.7rem;
    }
    .rec-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #ef4444;
      display: inline-block; margin-left: 0.4rem; animation: blink 1s infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .hud-phase { color: #94a3b8; font-family: monospace; font-size: 0.75rem; strong { color: #f59e0b; } }
    .abort-btn {
      background: #1e293b; border: 1px solid #334155; color: #cbd5e1;
      padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.65rem; cursor: pointer;
      &:hover { background: #ef4444; color: white; }
    }
    .hud-caption {
      color: #f8fafc; font-size: 0.95rem; line-height: 1.5; font-weight: 500;
      min-height: 46px; display: flex; align-items: center;
    }
    .progress-bar-container {
      width: 100%; height: 3px; background: #1e293b; border-radius: 2px;
      margin-top: 0.6rem; overflow: hidden;
    }
    .progress-fill { height: 100%; background: #38bdf8; transition: width 0.3s linear; }
  `]
})
export class DemoTourPlayerComponent implements OnInit, OnDestroy {
@Output() setRightView = new EventEmitter<'GRAPH' | 'MAP'>();
  @Output() triggerInspect = new EventEmitter<any>();
  @Output() clearInspect = new EventEmitter<void>();
  @Output() setPreset = new EventEmitter<'TODAY' | 'YESTERDAY' | 'LAST_7D' | 'ALL'>();
  @Output() setTimeWindow = new EventEmitter<{ start: string; end: string }>();

  isPlaying = false;
  currentSubtitle = '';
  currentBadge = '';
  cursorX = 100;
  cursorY = 100;
  isClicking = false;
  progressPercent = 0;

  private stepTimeout: any;
  private progressInterval: any;

  ngOnInit(): void {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.stopTour();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isPlaying) {
      this.stopTour();
    }
  };

  startTour(sampleLogs: any[]): void {
    this.isPlaying = true;
    this.runTourSteps(sampleLogs);
  }

  stopTour(): void {
    this.isPlaying = false;
    clearTimeout(this.stepTimeout);
    clearInterval(this.progressInterval);
  }

  private runTourSteps(logs: any[]): void {
    const targetItem = logs.find(l => (l.riskScore || 0) >= 95) || logs[0] || {
      importerNationalId: '0010000010',
      orderRegNumber: 'IR-MULE-001'
    };

    const steps: DemoStep[] = [
      // مرحله ۱: نمای کلان
      {
        duration: 5000,
        badgeText: 'MONITORING IRAN GRID',
        subtitle: 'سامانه دیدبان: پایش و تحلیل تقاطعی داده‌های کلان گمرک، شبکه بانکی شتاب و زیرساخت مخابراتی.',
        cursorPos: { x: window.innerWidth * 0.7, y: window.innerHeight * 0.35 },
        action: () => {
          this.clearInspect.emit();
          this.setRightView.emit('MAP');
        }
      },
      // مرحله ۲: تغییر تاریخ به دیروز
      {
        duration: 4500,
        badgeText: 'TIMELINE INTELLIGENCE (YESTERDAY)',
        subtitle: 'تغییر بازه زمانی به «دیروز»: نمودار هیستوگرام زمانی و گره‌های فعال بلادرنگ بازتولید می‌شوند.',
        cursorPos: { x: window.innerWidth * 0.58, y: window.innerHeight * 0.94, click: true },
        action: () => {
          this.setPreset.emit('YESTERDAY');
        }
      },
      // مرحله ۳: تغییر تاریخ به امروز و اعمال اسلایدر پیک
      {
        duration: 5000,
        badgeText: 'TIMELINE BRUSH FILTER',
        subtitle: 'فیلتر ساعات پیک: تمرکز روی پنجره زمانی بحرانی و حذف نویزهای اطلاعاتی و ترافیک غیرمرتبط.',
        cursorPos: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.94, click: true },
        action: () => {
          this.setPreset.emit('TODAY');
          this.setTimeWindow.emit({ start: '10:00', end: '16:00' });
        }
      },
      // مرحله ۴: بازرسی پرونده متخلف
      {
        duration: 5500,
        badgeText: 'INSPECTING FOCUSED DOSSIER',
        subtitle: 'آغاز فاز بازرسی پرونده: انتخاب حساب تجمیع‌کننده مشکوک و گذر خودکار سیستم به حالت پرونده اختصاصی.',
        cursorPos: { x: window.innerWidth * 0.28, y: window.innerHeight * 0.22, click: true },
        action: () => {
          this.triggerInspect.emit(targetItem);
        }
      },
      // مرحله ۵: سوییچ به گراف آنتولوژی
    {
  duration: 6000,
  badgeText: 'PALANTIR MULTI-HOP GRAPH',
  subtitle: 'استودیوی گراف پیوندی: کشف آنتولوژی شبکه پولشویی، حساب‌های اجاره‌ای و اسناد گمرکی با آیکون‌های وکتوری.',
  cursorPos: { x: window.innerWidth * 0.88, y: window.innerHeight * 0.12, click: true },
  action: () => {
    this.setRightView.emit('GRAPH'); // تغییر به 'GRAPH'
  }
},
      // مرحله ۶: حرکت روی نودهای گراف
      {
        duration: 5000,
        badgeText: 'MULTI-LAYER ENTITY PROBING',
        subtitle: 'کاوش عمیق لایه‌ها: استخراج زنجیره انتقال وجوه و ردگیری محموله‌ها جهت مستندسازی شواهد قضایی.',
        cursorPos: { x: window.innerWidth * 0.72, y: window.innerHeight * 0.45 },
        action: () => {}
      },
      // مرحله ۷: جمع‌بندی نهایی
      {
        duration: 5000,
        badgeText: 'FORENSIC READINESS',
        subtitle: 'دیدبان؛ بستر هوشمند تصمیم‌یاری و شفافیت مالی در تراز ملی. آماده صدور گزارش کارشناسی.',
        cursorPos: { x: window.innerWidth * 0.92, y: window.innerHeight * 0.04 },
        action: () => {}
      }
    ];

    let currentStepIndex = 0;
    const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
    let elapsedTime = 0;

    this.progressInterval = setInterval(() => {
      elapsedTime += 200;
      this.progressPercent = Math.min(100, (elapsedTime / totalDuration) * 100);
    }, 200);

    const executeNextStep = () => {
      if (currentStepIndex >= steps.length) {
        this.stopTour();
        return;
      }

      const step = steps[currentStepIndex];
      this.currentSubtitle = step.subtitle;
      this.currentBadge = step.badgeText;

      if (step.cursorPos) {
        this.cursorX = step.cursorPos.x;
        this.cursorY = step.cursorPos.y;
        if (step.cursorPos.click) {
          setTimeout(() => {
            this.isClicking = true;
            setTimeout(() => (this.isClicking = false), 400);
          }, 600);
        }
      }

      if (step.action) {
        step.action();
      }

      currentStepIndex++;
      this.stepTimeout = setTimeout(executeNextStep, step.duration);
    };

    executeNextStep();
  }
}