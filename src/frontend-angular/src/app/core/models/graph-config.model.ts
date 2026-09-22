// src/app/core/models/graph-config.model.ts
export interface DomainColumnOption {
  key: string;
  label: string;
  category: 'NODE' | 'EDGE_LABEL' | 'PROPERTY';
  selected: boolean;
}

export interface GraphProjectionConfig {
  customs: {
    orderNo: boolean;
    totalUsd: boolean;
    goodsDescription: boolean;
    cottageNo: boolean;
  };
  banking: {
    sourceAccount: boolean;
    destAccount: boolean;
    amount: boolean;
    rrn: boolean;
  };
  telecom: {
    callerMsisdn: boolean;
    receiverMsisdn: boolean;
    duration: boolean;
    cellId: boolean;
  };
}