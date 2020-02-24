exports.sls = function() {
  return this.options.files + String(arguments[0].name)
}
