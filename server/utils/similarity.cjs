const sharp = require('sharp')
const crypto = require('crypto')

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// 64-bit dHash as hex
async function dhash64(buffer) {
  const raw = await sharp(buffer).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let hash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x]
      const right = raw[y * 9 + x + 1]
      hash = (hash << 1n) | BigInt(left > right ? 1 : 0)
    }
  }
  return hash.toString(16).padStart(16, '0')
}

function hammingHex(a, b) {
  try {
    let v = BigInt('0x' + a) ^ BigInt('0x' + b)
    let c = 0
    while (v) {
      v &= (v - 1n)
      c++
    }
    return c
  } catch {
    return 64
  }
}

module.exports = { sha256Hex, dhash64, hammingHex }
