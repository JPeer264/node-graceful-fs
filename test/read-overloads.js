var fs = require('fs')
var t = require('tap')

// Each read fails one time with EAGAIN, so each case also goes through
// the retry.
var nativeRead = fs.read
var failNext = false
var retries = 0
fs.read = function () {
  var cb = arguments[arguments.length - 1]
  if (failNext && typeof cb === 'function') {
    failNext = false
    retries ++
    return process.nextTick(function () {
      var er = new Error('synthetic eagain')
      er.code = 'EAGAIN'
      cb(er)
    })
  }
  return nativeRead.apply(fs, arguments)
}

var g = require('../')

var file = t.testdir({ input: 'abcdef' }) + '/input'

var cases = {
  'fd, cb': function () {
    return []
  },
  'fd, {}, cb': function () {
    return [{}]
  },
  'fd, { length, position }, cb': function () {
    return [{ length: 3, position: 1 }]
  },
  'fd, { buffer, offset, length, position }, cb': function () {
    return [{ buffer: Buffer.alloc(5), offset: 1, length: 3, position: 2 }]
  },
  'fd, buffer, cb': function () {
    return [Buffer.alloc(3)]
  },
  'fd, buffer, { offset, length, position }, cb': function () {
    return [Buffer.alloc(5), { offset: 1, length: 3, position: 2 }]
  },
  'fd, buffer, offset, length, position, cb': function () {
    return [Buffer.alloc(5), 1, 3, 2]
  }
}

function read (fn, args, cb) {
  var fd = fs.openSync(file, 'r')
  function done (er, bytesRead, buffer) {
    fs.closeSync(fd)
    cb(er, bytesRead, buffer)
  }
  try {
    fn.apply(fs, [fd].concat(args, done))
  } catch (er) {
    done(er)
  }
}

Object.keys(cases).forEach(function (name) {
  t.test(name, function (t) {
    read(nativeRead, cases[name](), function (er, bytesRead, buffer) {
      if (er) {
        t.comment('this node version does not support this form: ' + er.code)
        return t.end()
      }
      var before = retries
      failNext = true
      read(g.read, cases[name](), function (gEr, gBytesRead, gBuffer) {
        t.error(gEr)
        t.equal(retries, before + 1, 'did the retry after EAGAIN')
        t.equal(gBytesRead, bytesRead)
        t.equal(gBuffer.toString('hex'), buffer.toString('hex'))
        t.end()
      })
    })
  })
})
