export interface DiscrepancyLog {
  id?: number;
  domainType?: string; // اضافه شد
  orderRegNumber: string;
  cottageNumber: string;
  importerNationalId: string;
  ruleName: string;
  description: string;
  riskScore: number;
  detectedAt: string;
}

export interface AuditRunResponse {
  message: string;
  totalViolations: number;
}

export interface CkdCase {
  importerName: string;
  importerId: string;
  targetProduct: string;
  totalValue: number;
  parts: {
    orderNo: string;
    hsCode: string;
    partName: string;
    valUsd: number;
  }[];
}

export type DomainType = 'CUSTOMS' | 'BANKING' | 'TELECOM';

export interface DomainOption {
  id: DomainType;
  label: string;
  desc: string;
}

export interface EntityLinkNode {
  id: string;                    // مثلاً کدملی یا شماره همراه
  name: string;
  displayLabel: string;
  category: 'PERSON' | 'PHONE' | 'BANK_ACCOUNT' | 'CUSTOMS_CARGO' | 'COMPANY';
  riskScore: number;
  properties: { [key: string]: any };
}

export interface EntityLinkEdge {
  source: string;
  target: string;
  predicate: string;            // شرح رابطه: تماس مکرر، واریز ساتنا، ثبت سفارش، ترخیص‌کار مشترک
  domain: 'CUSTOMS' | 'BANKING' | 'TELECOM' | 'CORPORATE';
  weight: number;               // شدت ارتباط (تعداد تماس‌ها، مبلغ واریزی، یا دفعات تکرار)
  details?: string;             // مثلاً "۱۲ واریز خرد | ۳۶ تماس مستقیم"
}

export interface MultiEntityLinkGraph {
  rootEntity: string;           // کدملی یا شماره همراه هدف اولیه
  nodes: EntityLinkNode[];
  edges: EntityLinkEdge[];
}