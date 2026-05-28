import { randomUUID } from 'node:crypto';

export function generateTraceId(): string {
  return randomUUID().replaceAll('-', '');
}

export function generateSpanId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 16);
}

export function nowNs(): number {
  return Date.now() * 1_000_000;
}

export function nowMs(): number {
  return Date.now();
}

export function calculateDurationNs(startNs: number, endNs: number): number {
  return endNs - startNs;
}

export function dateToTimestampNs(date: Date): number {
  return date.getTime() * 1_000_000;
}

export function timestampNsToDate(ns: number): Date {
  return new Date(ns / 1_000_000);
}

export function dateToTimestampMs(date: Date): number {
  return date.getTime();
}

export function timestampMsToDate(ms: number): Date {
  return new Date(ms);
}
