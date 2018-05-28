'use strict'

const rx = require('./rx')

module.exports = redactor

function redactor ({secret, serialize, wcLen}, state) {
  /* eslint-disable-next-line */
  const redact = Function('o', `
    if (typeof o !== 'object' || o == null) {
      throw Error('fast-redact: primitives cannot be redacted')
    }
    const { censor, secret } = this
    ${redactTmpl(secret)}
    this.compileRestore()
    ${dynamicRedactTmpl(wcLen > 0)}
    ${resultTmpl(serialize)}
  `).bind(state)

  if (serialize === false) {
    redact.restore = (o) => state.restore(o)
  }

  return redact
}

function redactTmpl (secret) {
  return Object.keys(secret).map((path) => {
    const { escPath } = secret[path]

    const hops = []
    var match
    while ((match = rx.exec(path)) !== null) {
      const [ , ix ] = match
      const { index, input } = match
      if (index > 0) hops.push(input.substring(0, index - (ix ? 0 : 1)))
    }

    var existence = hops.map((p) => `o.${p}`).join(' && ')
    if (existence.length === 0) existence += `o.${path} != null`
    else existence += ` && o.${path} != null`

    const circularDetection = `
        switch (true) {
          ${hops.reverse().map((p) => `
            case o.${p} === censor: 
              secret[${escPath}].circle = ${JSON.stringify(p)}
              break
          `).join('\n')}
        }
      `
    return `
        if (${existence}) {
          const val = o.${path}
          if (val === censor) {
            secret[${escPath}].precensored = true
          } else {
            secret[${escPath}].val = val
            o.${path} = censor
            ${circularDetection}
          }
        }
      `
  }).join('\n')
}

function dynamicRedactTmpl (hasWildcards) {
  return hasWildcards === true ? `
    {
      const { wildcards, wcLen, groupRedact, nestedRedact } = this
      for (var i = 0; i < wcLen; i++) {
        const { before, beforeStr, after, nested } = wildcards[i]
        if (nested === true) {
          secret[beforeStr] = secret[beforeStr] || []
          nestedRedact(secret[beforeStr], o, before, after, censor)
        } else secret[beforeStr] = groupRedact(o, before, censor)
      }
    }
  ` : ''
}

function resultTmpl (serialize) {
  return serialize === false ? `return o` : `
    var s = this.serialize(o)
    this.restore(o)
    return s
  `
}