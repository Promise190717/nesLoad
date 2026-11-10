'use client';

import dynamic from 'next/dynamic';
import { useI18n } from './I18nProvider';

/**
 * 联机房间的二维码（2026-11-10，用户要求：手机扫码直接进房）。
 *
 * 编进去的是 `shareLink()` 那条**和「分享」钮完全一样**的链接（`?room=XXXX`）——
 * 二维码不是第二条邀请通道，只是同一条邀请的另一种给法，所以两边必须同一个来源。
 *
 * 两件事让 `qrcode.react` 单独成 chunk、不拖进 `/play` 首屏包：
 *   · 只有房主**点开**二维码才会渲染（`PlayScene` 里那个 `roomQrOpen`）；
 *   · 链接是拿 `window.location` 拼的，服务端渲染时是空串 —— `ssr: false` 同时把
 *     「服务端画一个值为空的码」这件事挡掉。
 */
const QRCodeSVG = dynamic(
  () => import('qrcode.react').then((mod) => mod.QRCodeSVG),
  { ssr: false, loading: () => <span className="play-room-qr-wait" aria-hidden="true" /> }
);

export default function RoomQr({ url }: { url: string }) {
  const { t } = useI18n();

  return (
    <div className="play-room-qr" id="play-room-qr">
      {/*
        白纸写死、不跟主题：二维码必须**深码浅底**才扫得出来。深色主题下这块
        就是一张贴在机台上的贴纸，和 `--color-crt-*` 一样属于「不跟着翻」的那类。
      */}
      <div className="play-room-qr-paper">
        <QRCodeSVG
          value={url}
          size={120}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#121212"
          title={t('netplay.qr')}
        />
      </div>
      <p className="play-room-qr-hint">{t('netplay.qrHint')}</p>
    </div>
  );
}
