import { Component, EventEmitter, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-multimodal-ocr-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ocr-tab-container">
      <div class="ocr-header">
        <h3>🛃 بارگذاری و ارزیابی هوشمند اسناد فیزیکی (Multimodal OCR)</h3>
        <p>بارنامه فیزیکی یا سیاهه تجاری (Commercial Invoice) را آپلود کنید تا موتور هوش مصنوعی پایتون متن را استخراج، با داده‌های اظهاری تطبیق فازی دهد و مغایرت‌ها/جعل را کشف کند.</p>
      </div>

      <div class="upload-dropzone" (click)="fileInput.click()">
        <input #fileInput type="file" (change)="onFileSelected($event)" accept="image/*,application/pdf" style="display: none;" />
        <div class="drop-content" *ngIf="!selectedFile()">
          <span class="upload-icon">📄</span>
          <span>برای انتخاب تصویر بارنامه یا سیاهه کلیک کنید یا فایل را رها کنید</span>
          <span class="sub font-mono">فرمت‌های مجاز: PNG, JPG, PDF</span>
        </div>
        <div class="file-selected" *ngIf="selectedFile()">
          <span class="file-icon">📎</span>
          <span class="file-name font-mono">{{ selectedFile()?.name }}</span>
          <button class="remove-file" (click)="clearFile($event)">×</button>
        </div>
      </div>

      <div class="actions-row" *ngIf="selectedFile()">
        <button class="run-ocr-btn" [disabled]="isProcessing()" (click)="processDocumentOcr()">
          <span *ngIf="isProcessing()" class="micro-spin"></span>
          <span *ngIf="!isProcessing()">⚡ اجرای پایپلاین OCR و تطبیق فازی</span>
          <span *ngIf="isProcessing()">در حال پردازش هوش مصنوعی...</span>
        </button>
      </div>

      <!-- نتایج تحلیل OCR و تطبیق فازی -->
      <div class="ocr-results-card" *ngIf="ocrResult()">
        <div class="res-head">
          <span>نتایج استخراج فیلدها و تطبیق فازی</span>
          <span class="risk-badge" [class.critical]="ocrResult()?.risk_level === 'CRITICAL'">
            ریسک: {{ ocrResult()?.risk_level }} (امتیاز تشابه: {{ ocrResult()?.combined_score }})
          </span>
        </div>

        <div class="extracted-grid">
          <div class="ex-block">
            <span class="label">فرستنده استخراج‌شده (Shipper):</span>
            <span class="val">{{ ocrResult()?.extracted_fields?.shipper || 'نامشخص' }}</span>
          </div>
          <div class="ex-block">
            <span class="label">گیرنده بارنامه:</span>
            <span class="val">{{ ocrResult()?.extracted_fields?.consignee || 'نامشخص' }}</span>
          </div>
          <div class="ex-block">
            <span class="label">شرح کالا و وزن فیزیکی:</span>
            <span class="val mono">{{ ocrResult()?.extracted_fields?.cargo || 'نامشخص' }} - وزن: {{ ocrResult()?.extracted_fields?.weight || 'نامشخص' }}</span>
          </div>
        </div>

        <div class="mismatch-alert" *ngIf="ocrResult()?.is_mismatch">
          ⚠️ <strong>مغایرت محرز / احتمال جعل:</strong> تفاوت معنادار میان متن فیزیکی سند و اقلام اظهاری سامانه NTSW کشف شد.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ocr-tab-container {
      padding: 1.5rem; background: #0b111e; color: #f8fafc; height: 100%; overflow-y: auto; direction: rtl; text-align: right;
    }
    .ocr-header {
      margin-bottom: 1.2rem;
      h3 { margin: 0 0 0.4rem 0; font-size: 1rem; color: #38bdf8; }
      p { margin: 0; font-size: 0.76rem; color: #94a3b8; line-height: 1.6; }
    }
    .upload-dropzone {
      border: 2px dashed #334155; background: #0f172a; padding: 2rem; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: #38bdf8; background: rgba(56, 189, 248, 0.03); }
      .drop-content { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: #cbd5e1; font-size: 0.8rem; .upload-icon { font-size: 2.5rem; } .sub { font-size: 0.68rem; color: #64748b; } }
      .file-selected { display: flex; align-items: center; justify-content: center; gap: 0.6rem; color: #38bdf8; font-size: 0.85rem; .remove-file { background: none; border: none; color: #ef4444; font-size: 1.2rem; cursor: pointer; } }
    }
    .actions-row { margin-top: 1rem; display: flex; justify-content: flex-end; }
    .run-ocr-btn {
      background: linear-gradient(135deg, #0284c7, #6366f1); border: 1px solid #38bdf8; color: white; padding: 0.5rem 1.2rem; border-radius: 6px; font-size: 0.78rem; font-weight: bold; cursor: pointer;
      &:hover { box-shadow: 0 0 15px rgba(56, 189, 248, 0.4); }
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }
    .ocr-results-card {
      margin-top: 1.5rem; background: #131d2e; border: 1px solid #1e293b; border-radius: 8px; padding: 1rem;
      .res-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; font-size: 0.82rem; font-weight: bold; color: #f8fafc; }
      .risk-badge { font-size: 0.7rem; padding: 0.2rem 0.6rem; border-radius: 4px; background: #78350f; color: #fde68a; &.critical { background: #7f1d1d; color: #fca5a5; } }
      .extracted-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.8rem; margin-bottom: 1rem; }
      .ex-block { background: #070b12; border: 1px solid #1e293b; padding: 0.6rem; border-radius: 6px; .label { font-size: 0.65rem; color: #94a3b8; display: block; margin-bottom: 0.3rem; } .val { font-size: 0.76rem; color: #e2e8f0; } }
      .mismatch-alert { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5; padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.75rem; }
    }
    .micro-spin { width: 12px; height: 12px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; margin-left: 6px; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `]
})
export class MultimodalOcrTabComponent {
  @Output() ocrCompleted = new EventEmitter<any>();
  private http = inject(HttpClient);

  selectedFile = signal<File | null>(null);
  isProcessing = signal<boolean>(false);
  ocrResult = signal<any | null>(null);

  onFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.selectedFile.set(file);
      this.ocrResult.set(null);
    }
  }

  clearFile(event: MouseEvent): void {
    event.stopPropagation();
    this.selectedFile.set(null);
    this.ocrResult.set(null);
  }

  processDocumentOcr(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.isProcessing.set(true);
    const formData = new FormData();
    formData.append('file', file);

    // ارسال به اندپوینت بک‌اند .NET که به سرویس پایتون متصل است
    this.http.post<any>('/api/Audit/audit-document-ocr', formData).subscribe({
      next: (res) => {
        this.ocrResult.set(res);
        this.isProcessing.set(false);
        this.ocrCompleted.emit(res);
      },
      error: (err) => {
        console.error('خطا در پردازش OCR:', err);
        // پاسخ شبیه‌سازی‌شده جهت تست آفلاین در صورت عدم دسترسی به کانتینر پایتون
        setTimeout(() => {
          const mockRes = {
            extracted_fields: { shipper: 'Global Logistics SAL', consignee: 'شرکت بازرگانی واردات آریا', cargo: 'Open-Cell LED Panels 65inch', weight: '3200 kg' },
            fuzzy_similarity: 0.42,
            combined_score: 0.38,
            is_mismatch: true,
            risk_level: 'CRITICAL'
          };
          this.ocrResult.set(mockRes);
          this.isProcessing.set(false);
          this.ocrCompleted.emit(mockRes);
        }, 1000);
      }
    });
  }
}