import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Signal } from '../Signal.tsx';

describe('Signal Component Confidence Rendering', () => {
  it('renders "Cao" for high confidence string, no 88% or model confidence label', () => {
    const html = renderToStaticMarkup(
      <Signal type="BUY" confidence="high" />
    );
    expect(html).toContain('Cao');
    expect(html).toContain('Mức tin cậy');
    expect(html).not.toContain('88%');
    expect(html).not.toContain('Độ tin cậy mô hình');
  });

  it('renders "Trung bình" for medium confidence string, no 65% or model confidence label', () => {
    const html = renderToStaticMarkup(
      <Signal type="BUY" confidence="medium" />
    );
    expect(html).toContain('Trung bình');
    expect(html).not.toContain('65%');
    expect(html).not.toContain('Độ tin cậy mô hình');
  });

  it('renders "Tháp" for low confidence string, no 40% or model confidence label', () => {
    const html = renderToStaticMarkup(
      <Signal type="BUY" confidence="low" />
    );
    expect(html).toContain('Thấp');
    expect(html).not.toContain('40%');
    expect(html).not.toContain('Độ tin cậy mô hình');
  });

  it('renders "72%" with model confidence label for number 72', () => {
    const html = renderToStaticMarkup(
      <Signal type="BUY" confidence={72} />
    );
    expect(html).toContain('72%');
    expect(html).toContain('Độ tin cậy mô hình');
  });

  it('renders nothing for NaN confidence, no NaN or model confidence label', () => {
    const html = renderToStaticMarkup(
      <Signal type="BUY" confidence={Number.NaN} />
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Độ tin cậy mô hình');
  });

  it('renders nothing when no confidence prop provided', () => {
    const html = renderToStaticMarkup(
      <Signal type="BUY" />
    );
    expect(html).not.toContain('Độ tin cậy mô hình');
    expect(html).not.toContain('Mức tin cậy');
  });
});