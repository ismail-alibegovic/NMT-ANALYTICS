export default {
  postcssPlugin: 'strip-empty-is',
  OnceExit(root) {
    root.walkRules(rule => {
      rule.selector = rule.selector.replace(/:is\(\)/g, '');
    });
  },
};
