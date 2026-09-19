import { AppError } from './server';
export async function validateStoredMedia(bucket: R2Bucket, m: any) {
  const invalid = () => {
    throw new AppError(
      m.media_type === 'image' ? 'INVALID_IMAGE_TYPE' : 'INVALID_VIDEO_TYPE',
    );
  };
  const slice = async (offset: number, length: number) => {
    const o = await bucket.get(m.file_url, {
      range: { offset, length: Math.min(length, m.file_size - offset) },
    });
    if (!o) invalid();
    return new Uint8Array(await o!.arrayBuffer());
  };
  const head = await slice(0, Math.min(m.file_size, 131072)),
    tail = await slice(Math.max(0, m.file_size - 32), 32);
  const str = (a: Uint8Array, start: number, end: number) =>
    String.fromCharCode(...a.slice(start, end));
  const u32 = (a: Uint8Array, i: number) =>
    new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(i);
  const le32 = (a: Uint8Array, i: number) =>
    new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(i, true);
  if (m.media_type === 'image') {
    if (m.file_size < 24) invalid();
    let width = 0,
      height = 0;
    if (m.mime === 'image/png') {
      if (
        str(head, 12, 16) !== 'IHDR' ||
        str(tail, tail.length - 8, tail.length - 4) !== 'IEND'
      )
        invalid();
      width = u32(head, 16);
      height = u32(head, 20);
    } else if (m.mime === 'image/gif') {
      if (tail[tail.length - 1] !== 0x3b) invalid();
      width = head[6] + 256 * head[7];
      height = head[8] + 256 * head[9];
    } else if (m.mime === 'image/webp') {
      if (le32(head, 4) + 8 !== m.file_size) invalid();
      const type = str(head, 12, 16);
      if (type === 'VP8X') {
        width = 1 + head[24] + head[25] * 256 + head[26] * 65536;
        height = 1 + head[27] + head[28] * 256 + head[29] * 65536;
      } else if (type === 'VP8 ') {
        if (head[23] !== 0x9d || head[24] !== 1 || head[25] !== 0x2a) invalid();
        width = (head[26] + head[27] * 256) & 0x3fff;
        height = (head[28] + head[29] * 256) & 0x3fff;
      } else if (type === 'VP8L') {
        if (head[20] !== 0x2f) invalid();
        width = 1 + ((head[21] + head[22] * 256) & 0x3fff);
        height =
          1 + (((head[22] >> 6) + head[23] * 4 + head[24] * 1024) & 0x3fff);
      } else invalid();
    } else {
      if (tail[tail.length - 2] !== 255 || tail[tail.length - 1] !== 217)
        invalid();
      let p = 2;
      while (p + 9 < head.length) {
        if (head[p] !== 255) break;
        const marker = head[p + 1],
          length = head[p + 2] * 256 + head[p + 3];
        if (
          [
            0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
            0xce, 0xcf,
          ].includes(marker)
        ) {
          height = head[p + 5] * 256 + head[p + 6];
          width = head[p + 7] * 256 + head[p + 8];
          break;
        }
        if (marker === 0xda || length < 2) break;
        p += 2 + length;
      }
    }
    if (!width || !height || width * height > 100000000) invalid();
    return;
  }
  if (m.file_size < 128) invalid();
  if (m.mime === 'video/webm') {
    const vint = (a: Uint8Array, p: number, id = false) => {
      if (p >= a.length || !a[p]) invalid();
      let n = 1,
        mask = 128;
      while (!(a[p] & mask)) {
        n++;
        mask >>= 1;
      }
      if (n > (id ? 4 : 8) || p + n > a.length) invalid();
      let value = id ? a[p] : a[p] & (mask - 1),
        unknown = !id && value === mask - 1;
      for (let i = 1; i < n; i++) {
        value = value * 256 + a[p + i];
        unknown = unknown && a[p + i] === 255;
      }
      return { n, value: unknown ? -1 : value };
    };
    const elem = (a: Uint8Array, p: number, end: number) => {
      const id = vint(a, p, true),
        size = vint(a, p + id.n),
        start = p + id.n + size.n,
        stop = size.value === -1 ? end : start + size.value;
      if (stop > end || stop <= p) invalid();
      return { id: id.value, start, end: stop };
    };
    const top = async (p: number, end: number) => {
      const a = await slice(p, 16),
        e = elem(a, 0, end - p);
      return { id: e.id, start: p + e.start, end: p + e.end };
    };
    const header = await top(0, m.file_size);
    if (header.id !== 0x1a45dfa3 || header.end > 4096) invalid();
    const h = await slice(0, header.end);
    let doctype = false;
    for (let p = header.start; p < header.end;) {
      const e = elem(h, p, header.end);
      if (e.id === 0x4282 && str(h, e.start, e.end) === 'webm') doctype = true;
      p = e.end;
    }
    if (!doctype) invalid();
    const segment = await top(header.end, m.file_size);
    if (segment.id !== 0x18538067) invalid();
    let videoTrack = 0,
      hasFrame = false,
      loops = 0;
    for (let pos = segment.start; pos < segment.end && loops++ < 10000;) {
      const e = await top(pos, segment.end);
      if (e.id === 0x1654ae6b) {
        if (e.end - e.start > 2 * 1024 * 1024) invalid();
        const a = await slice(e.start, e.end - e.start);
        for (let p = 0; p < a.length;) {
          const track = elem(a, p, a.length);
          if (track.id === 0xae) {
            let no = 0,
              type = 0,
              codec = '',
              w = 0,
              ht = 0;
            const num = (b: number, end: number) => {
              let v = 0;
              for (let i = b; i < end; i++) v = v * 256 + a[i];
              return v;
            };
            for (let j = track.start; j < track.end;) {
              const t = elem(a, j, track.end);
              if (t.id === 0xd7) no = num(t.start, t.end);
              if (t.id === 0x83) type = num(t.start, t.end);
              if (t.id === 0x86) codec = str(a, t.start, t.end);
              if (t.id === 0xe0) {
                for (let k = t.start; k < t.end;) {
                  const v = elem(a, k, t.end);
                  if (v.id === 0xb0) w = num(v.start, v.end);
                  if (v.id === 0xba) ht = num(v.start, v.end);
                  k = v.end;
                }
              }
              j = t.end;
            }
            if (
              type === 1 &&
              ['V_VP8', 'V_VP9', 'V_AV1'].includes(codec) &&
              w > 0 &&
              ht > 0 &&
              w * ht <= 100000000
            )
              videoTrack = no;
          }
          p = track.end;
        }
      }
      if (e.id === 0x1f43b675 && videoTrack) {
        let p = e.start,
          checked = 0;
        while (p < e.end && checked++ < 10000) {
          const t = await top(p, e.end);
          let block = t;
          if (t.id === 0xa0) {
            let g = t.start;
            while (g < t.end) {
              const n = await top(g, t.end);
              if (n.id === 0xa1) {
                block = n;
                break;
              }
              g = n.end;
            }
          }
          if ([0xa3, 0xa1].includes(block.id) && block.end - block.start > 8) {
            const a = await slice(block.start, 16);
            if (vint(a, 0).value === videoTrack) {
              hasFrame = true;
              break;
            }
          }
          p = t.end;
        }
      }
      if (videoTrack && hasFrame) return;
      pos = e.end;
    }
    invalid();
    return;
  }
  let offset = 0,
    moov: Uint8Array | null = null,
    hasMedia = false,
    count = 0;
  while (offset + 8 <= m.file_size && count++ < 10000) {
    const box = await slice(offset, 16);
    let size = u32(box, 0),
      header = 8;
    const type = str(box, 4, 8);
    if (size === 1) {
      size = Number(new DataView(box.buffer).getBigUint64(8));
      header = 16;
    }
    if (size === 0) size = m.file_size - offset;
    if (
      !Number.isSafeInteger(size) ||
      size < header ||
      offset + size > m.file_size
    )
      invalid();
    if (type === 'moov') {
      if (size > 8 * 1024 * 1024) invalid();
      moov = await slice(offset, size);
    }
    if (type === 'mdat' && size > header + 16) hasMedia = true;
    offset += size;
  }
  if (offset !== m.file_size || !moov || !hasMedia) invalid();
  let video = false,
    codec = false;
  const parse = (a: Uint8Array, start: number, end: number, depth: number) => {
    if (depth > 12) invalid();
    let p = start;
    while (p + 8 <= end) {
      const size = u32(a, p),
        type = str(a, p + 4, p + 8);
      if (size < 8 || p + size > end) invalid();
      if (type === 'hdlr' && size >= 24 && str(a, p + 16, p + 20) === 'vide')
        video = true;
      if (type === 'stsd' && size >= 24) {
        let entry = p + 16;
        while (entry + 8 <= p + size) {
          const len = u32(a, entry);
          if (len < 8 || entry + len > p + size) invalid();
          if (
            ['avc1', 'avc3', 'vp09', 'av01'].includes(
              str(a, entry + 4, entry + 8),
            )
          )
            codec = true;
          entry += len;
        }
      }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type))
        parse(a, p + 8, p + size, depth + 1);
      p += size;
    }
  };
  parse(moov!, 0, moov!.length, 0);
  if (!video || !codec)
    throw new AppError('UNSUPPORTED_VIDEO_CODEC', 400, {
      message: '请使用 H.264 MP4 / MOV 或 VP8、VP9、AV1 视频编码。',
    });
}
