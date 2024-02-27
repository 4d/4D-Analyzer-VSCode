

export function debugLog(...inArgs) {
    var args = Array.prototype.slice.call(inArgs);
    args.unshift("[4D-Analyzer]")
    console.log.apply(console, args);
}