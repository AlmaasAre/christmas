(function (window, angular, undefined) {
  'use strict';
  var $resourceMinErr = angular.$$minErr('$resource');
  var MEMBER_NAME_REGEX = /^(\.[a-zA-Z_$][0-9a-zA-Z_$]*)+$/;
  function isValidDottedPath(path) {
    return path != null && path !== '' && path !== 'hasOwnProperty' && MEMBER_NAME_REGEX.test('.' + path);
  }
  function lookupDottedPath(obj, path) {
    if (!isValidDottedPath(path)) {
      throw $resourceMinErr('badmember', 'Dotted member path "@{0}" is invalid.', path);
    }
    var keys = path.split('.');
    for (var i = 0, ii = keys.length; i < ii && obj !== undefined; i++) {
      var key = keys[i];
      obj = obj !== null ? obj[key] : undefined;
    }
    return obj;
  }
  angular.module('ngResource', ['ng']).factory('$resource', [
    '$http',
    '$q',
    function ($http, $q) {
      var DEFAULT_ACTIONS = {
          'get': { method: 'GET' },
          'save': { method: 'POST' },
          'query': {
            method: 'GET',
            isArray: true
          },
          'remove': { method: 'DELETE' },
          'delete': { method: 'DELETE' }
        };
      var noop = angular.noop, forEach = angular.forEach, extend = angular.extend, copy = angular.copy, isFunction = angular.isFunction;
      function encodeUriSegment(val) {
        return encodeUriQuery(val, true).replace(/%26/gi, '&').replace(/%3D/gi, '=').replace(/%2B/gi, '+');
      }
      function encodeUriQuery(val, pctEncodeSpaces) {
        return encodeURIComponent(val).replace(/%40/gi, '@').replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, pctEncodeSpaces ? '%20' : '+');
      }
      function Route(template, defaults) {
        this.template = template;
        this.defaults = defaults || {};
        this.urlParams = {};
      }
      Route.prototype = {
        setUrlParams: function (config, params, actionUrl) {
          var self = this, url = actionUrl || self.template, val, encodedVal;
          var urlParams = self.urlParams = {};
          forEach(url.split(/\W/), function (param) {
            if (param === 'hasOwnProperty') {
              throw $resourceMinErr('badname', 'hasOwnProperty is not a valid parameter name.');
            }
            if (!new RegExp('^\\d+$').test(param) && param && new RegExp('(^|[^\\\\]):' + param + '(\\W|$)').test(url)) {
              urlParams[param] = true;
            }
          });
          url = url.replace(/\\:/g, ':');
          params = params || {};
          forEach(self.urlParams, function (_, urlParam) {
            val = params.hasOwnProperty(urlParam) ? params[urlParam] : self.defaults[urlParam];
            if (angular.isDefined(val) && val !== null) {
              encodedVal = encodeUriSegment(val);
              url = url.replace(new RegExp(':' + urlParam + '(\\W|$)', 'g'), encodedVal + '$1');
            } else {
              url = url.replace(new RegExp('(/?):' + urlParam + '(\\W|$)', 'g'), function (match, leadingSlashes, tail) {
                if (tail.charAt(0) == '/') {
                  return tail;
                } else {
                  return leadingSlashes + tail;
                }
              });
            }
          });
          url = url.replace(/\/+$/, '');
          url = url.replace(/\/\.(?=\w+($|\?))/, '.');
          config.url = url.replace(/\/\\\./, '/.');
          forEach(params, function (value, key) {
            if (!self.urlParams[key]) {
              config.params = config.params || {};
              config.params[key] = value;
            }
          });
        }
      };
      function resourceFactory(url, paramDefaults, actions) {
        var route = new Route(url);
        actions = extend({}, DEFAULT_ACTIONS, actions);
        function extractParams(data, actionParams) {
          var ids = {};
          actionParams = extend({}, paramDefaults, actionParams);
          forEach(actionParams, function (value, key) {
            if (isFunction(value)) {
              value = value();
            }
            ids[key] = value && value.charAt && value.charAt(0) == '@' ? lookupDottedPath(data, value.substr(1)) : value;
          });
          return ids;
        }
        function defaultResponseInterceptor(response) {
          return response.resource;
        }
        function Resource(value) {
          copy(value || {}, this);
        }
        forEach(actions, function (action, name) {
          var hasBody = /^(POST|PUT|PATCH)$/i.test(action.method);
          Resource[name] = function (a1, a2, a3, a4) {
            var params = {}, data, success, error;
            switch (arguments.length) {
            case 4:
              error = a4;
              success = a3;
            case 3:
            case 2:
              if (isFunction(a2)) {
                if (isFunction(a1)) {
                  success = a1;
                  error = a2;
                  break;
                }
                success = a2;
                error = a3;
              } else {
                params = a1;
                data = a2;
                success = a3;
                break;
              }
            case 1:
              if (isFunction(a1))
                success = a1;
              else if (hasBody)
                data = a1;
              else
                params = a1;
              break;
            case 0:
              break;
            default:
              throw $resourceMinErr('badargs', 'Expected up to 4 arguments [params, data, success, error], got {0} arguments', arguments.length);
            }
            var isInstanceCall = data instanceof Resource;
            var value = isInstanceCall ? data : action.isArray ? [] : new Resource(data);
            var httpConfig = {};
            var responseInterceptor = action.interceptor && action.interceptor.response || defaultResponseInterceptor;
            var responseErrorInterceptor = action.interceptor && action.interceptor.responseError || undefined;
            forEach(action, function (value, key) {
              if (key != 'params' && key != 'isArray' && key != 'interceptor') {
                httpConfig[key] = copy(value);
              }
            });
            if (hasBody)
              httpConfig.data = data;
            route.setUrlParams(httpConfig, extend({}, extractParams(data, action.params || {}), params), action.url);
            var promise = $http(httpConfig).then(function (response) {
                var data = response.data, promise = value.$promise;
                if (data) {
                  if (angular.isArray(data) !== !!action.isArray) {
                    throw $resourceMinErr('badcfg', 'Error in resource configuration. Expected ' + 'response to contain an {0} but got an {1}', action.isArray ? 'array' : 'object', angular.isArray(data) ? 'array' : 'object');
                  }
                  if (action.isArray) {
                    value.length = 0;
                    forEach(data, function (item) {
                      value.push(new Resource(item));
                    });
                  } else {
                    copy(data, value);
                    value.$promise = promise;
                  }
                }
                value.$resolved = true;
                response.resource = value;
                return response;
              }, function (response) {
                value.$resolved = true;
                (error || noop)(response);
                return $q.reject(response);
              });
            promise = promise.then(function (response) {
              var value = responseInterceptor(response);
              (success || noop)(value, response.headers);
              return value;
            }, responseErrorInterceptor);
            if (!isInstanceCall) {
              value.$promise = promise;
              value.$resolved = false;
              return value;
            }
            return promise;
          };
          Resource.prototype['$' + name] = function (params, success, error) {
            if (isFunction(params)) {
              error = success;
              success = params;
              params = {};
            }
            var result = Resource[name](params, this, success, error);
            return result.$promise || result;
          };
        });
        Resource.bind = function (additionalParamDefaults) {
          return resourceFactory(url, extend({}, paramDefaults, additionalParamDefaults), actions);
        };
        return Resource;
      }
      return resourceFactory;
    }
  ]);
}(window, window.angular));
(function (window, angular, undefined) {
  'use strict';
  angular.module('ngCookies', ['ng']).factory('$cookies', [
    '$rootScope',
    '$browser',
    function ($rootScope, $browser) {
      var cookies = {}, lastCookies = {}, lastBrowserCookies, runEval = false, copy = angular.copy, isUndefined = angular.isUndefined;
      $browser.addPollFn(function () {
        var currentCookies = $browser.cookies();
        if (lastBrowserCookies != currentCookies) {
          lastBrowserCookies = currentCookies;
          copy(currentCookies, lastCookies);
          copy(currentCookies, cookies);
          if (runEval)
            $rootScope.$apply();
        }
      })();
      runEval = true;
      $rootScope.$watch(push);
      return cookies;
      function push() {
        var name, value, browserCookies, updated;
        for (name in lastCookies) {
          if (isUndefined(cookies[name])) {
            $browser.cookies(name, undefined);
          }
        }
        for (name in cookies) {
          value = cookies[name];
          if (!angular.isString(value)) {
            if (angular.isDefined(lastCookies[name])) {
              cookies[name] = lastCookies[name];
            } else {
              delete cookies[name];
            }
          } else if (value !== lastCookies[name]) {
            $browser.cookies(name, value);
            updated = true;
          }
        }
        if (updated) {
          updated = false;
          browserCookies = $browser.cookies();
          for (name in cookies) {
            if (cookies[name] !== browserCookies[name]) {
              if (isUndefined(browserCookies[name])) {
                delete cookies[name];
              } else {
                cookies[name] = browserCookies[name];
              }
              updated = true;
            }
          }
        }
      }
    }
  ]).factory('$cookieStore', [
    '$cookies',
    function ($cookies) {
      return {
        get: function (key) {
          var value = $cookies[key];
          return value ? angular.fromJson(value) : value;
        },
        put: function (key, value) {
          $cookies[key] = angular.toJson(value);
        },
        remove: function (key) {
          delete $cookies[key];
        }
      };
    }
  ]);
}(window, window.angular));
(function (window, angular, undefined) {
  'use strict';
  var $sanitizeMinErr = angular.$$minErr('$sanitize');
  var $sanitize = function (html) {
    var buf = [];
    htmlParser(html, htmlSanitizeWriter(buf));
    return buf.join('');
  };
  var START_TAG_REGEXP = /^<\s*([\w:-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)\s*>/, END_TAG_REGEXP = /^<\s*\/\s*([\w:-]+)[^>]*>/, ATTR_REGEXP = /([\w:-]+)(?:\s*=\s*(?:(?:"((?:[^"])*)")|(?:'((?:[^'])*)')|([^>\s]+)))?/g, BEGIN_TAG_REGEXP = /^</, BEGING_END_TAGE_REGEXP = /^<\s*\//, COMMENT_REGEXP = /<!--(.*?)-->/g, DOCTYPE_REGEXP = /<!DOCTYPE([^>]*?)>/i, CDATA_REGEXP = /<!\[CDATA\[(.*?)]]>/g, URI_REGEXP = /^((ftp|https?):\/\/|mailto:|tel:|#)/i, NON_ALPHANUMERIC_REGEXP = /([^\#-~| |!])/g;
  var voidElements = makeMap('area,br,col,hr,img,wbr');
  var optionalEndTagBlockElements = makeMap('colgroup,dd,dt,li,p,tbody,td,tfoot,th,thead,tr'), optionalEndTagInlineElements = makeMap('rp,rt'), optionalEndTagElements = angular.extend({}, optionalEndTagInlineElements, optionalEndTagBlockElements);
  var blockElements = angular.extend({}, optionalEndTagBlockElements, makeMap('address,article,' + 'aside,blockquote,caption,center,del,dir,div,dl,figure,figcaption,footer,h1,h2,h3,h4,h5,' + 'h6,header,hgroup,hr,ins,map,menu,nav,ol,pre,script,section,table,ul'));
  var inlineElements = angular.extend({}, optionalEndTagInlineElements, makeMap('a,abbr,acronym,b,' + 'bdi,bdo,big,br,cite,code,del,dfn,em,font,i,img,ins,kbd,label,map,mark,q,ruby,rp,rt,s,' + 'samp,small,span,strike,strong,sub,sup,time,tt,u,var'));
  var specialElements = makeMap('script,style');
  var validElements = angular.extend({}, voidElements, blockElements, inlineElements, optionalEndTagElements);
  var uriAttrs = makeMap('background,cite,href,longdesc,src,usemap');
  var validAttrs = angular.extend({}, uriAttrs, makeMap('abbr,align,alt,axis,bgcolor,border,cellpadding,cellspacing,class,clear,' + 'color,cols,colspan,compact,coords,dir,face,headers,height,hreflang,hspace,' + 'ismap,lang,language,nohref,nowrap,rel,rev,rows,rowspan,rules,' + 'scope,scrolling,shape,span,start,summary,target,title,type,' + 'valign,value,vspace,width'));
  function makeMap(str) {
    var obj = {}, items = str.split(','), i;
    for (i = 0; i < items.length; i++)
      obj[items[i]] = true;
    return obj;
  }
  function htmlParser(html, handler) {
    var index, chars, match, stack = [], last = html;
    stack.last = function () {
      return stack[stack.length - 1];
    };
    while (html) {
      chars = true;
      if (!stack.last() || !specialElements[stack.last()]) {
        if (html.indexOf('<!--') === 0) {
          index = html.indexOf('--', 4);
          if (index >= 0 && html.lastIndexOf('-->', index) === index) {
            if (handler.comment)
              handler.comment(html.substring(4, index));
            html = html.substring(index + 3);
            chars = false;
          }
        } else if (DOCTYPE_REGEXP.test(html)) {
          match = html.match(DOCTYPE_REGEXP);
          if (match) {
            html = html.replace(match[0], '');
            chars = false;
          }
        } else if (BEGING_END_TAGE_REGEXP.test(html)) {
          match = html.match(END_TAG_REGEXP);
          if (match) {
            html = html.substring(match[0].length);
            match[0].replace(END_TAG_REGEXP, parseEndTag);
            chars = false;
          }
        } else if (BEGIN_TAG_REGEXP.test(html)) {
          match = html.match(START_TAG_REGEXP);
          if (match) {
            html = html.substring(match[0].length);
            match[0].replace(START_TAG_REGEXP, parseStartTag);
            chars = false;
          }
        }
        if (chars) {
          index = html.indexOf('<');
          var text = index < 0 ? html : html.substring(0, index);
          html = index < 0 ? '' : html.substring(index);
          if (handler.chars)
            handler.chars(decodeEntities(text));
        }
      } else {
        html = html.replace(new RegExp('(.*)<\\s*\\/\\s*' + stack.last() + '[^>]*>', 'i'), function (all, text) {
          text = text.replace(COMMENT_REGEXP, '$1').replace(CDATA_REGEXP, '$1');
          if (handler.chars)
            handler.chars(decodeEntities(text));
          return '';
        });
        parseEndTag('', stack.last());
      }
      if (html == last) {
        throw $sanitizeMinErr('badparse', 'The sanitizer was unable to parse the following block ' + 'of html: {0}', html);
      }
      last = html;
    }
    parseEndTag();
    function parseStartTag(tag, tagName, rest, unary) {
      tagName = angular.lowercase(tagName);
      if (blockElements[tagName]) {
        while (stack.last() && inlineElements[stack.last()]) {
          parseEndTag('', stack.last());
        }
      }
      if (optionalEndTagElements[tagName] && stack.last() == tagName) {
        parseEndTag('', tagName);
      }
      unary = voidElements[tagName] || !!unary;
      if (!unary)
        stack.push(tagName);
      var attrs = {};
      rest.replace(ATTR_REGEXP, function (match, name, doubleQuotedValue, singleQuotedValue, unquotedValue) {
        var value = doubleQuotedValue || singleQuotedValue || unquotedValue || '';
        attrs[name] = decodeEntities(value);
      });
      if (handler.start)
        handler.start(tagName, attrs, unary);
    }
    function parseEndTag(tag, tagName) {
      var pos = 0, i;
      tagName = angular.lowercase(tagName);
      if (tagName)
        for (pos = stack.length - 1; pos >= 0; pos--)
          if (stack[pos] == tagName)
            break;
      if (pos >= 0) {
        for (i = stack.length - 1; i >= pos; i--)
          if (handler.end)
            handler.end(stack[i]);
        stack.length = pos;
      }
    }
  }
  var hiddenPre = document.createElement('pre');
  function decodeEntities(value) {
    hiddenPre.innerHTML = value.replace(/</g, '&lt;');
    return hiddenPre.innerText || hiddenPre.textContent || '';
  }
  function encodeEntities(value) {
    return value.replace(/&/g, '&amp;').replace(NON_ALPHANUMERIC_REGEXP, function (value) {
      return '&#' + value.charCodeAt(0) + ';';
    }).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function htmlSanitizeWriter(buf) {
    var ignore = false;
    var out = angular.bind(buf, buf.push);
    return {
      start: function (tag, attrs, unary) {
        tag = angular.lowercase(tag);
        if (!ignore && specialElements[tag]) {
          ignore = tag;
        }
        if (!ignore && validElements[tag] === true) {
          out('<');
          out(tag);
          angular.forEach(attrs, function (value, key) {
            var lkey = angular.lowercase(key);
            if (validAttrs[lkey] === true && (uriAttrs[lkey] !== true || value.match(URI_REGEXP))) {
              out(' ');
              out(key);
              out('="');
              out(encodeEntities(value));
              out('"');
            }
          });
          out(unary ? '/>' : '>');
        }
      },
      end: function (tag) {
        tag = angular.lowercase(tag);
        if (!ignore && validElements[tag] === true) {
          out('</');
          out(tag);
          out('>');
        }
        if (tag == ignore) {
          ignore = false;
        }
      },
      chars: function (chars) {
        if (!ignore) {
          out(encodeEntities(chars));
        }
      }
    };
  }
  angular.module('ngSanitize', []).value('$sanitize', $sanitize);
  angular.module('ngSanitize').filter('linky', function () {
    var LINKY_URL_REGEXP = /((ftp|https?):\/\/|(mailto:)?[A-Za-z0-9._%+-]+@)\S*[^\s.;,(){}<>]/, MAILTO_REGEXP = /^mailto:/;
    return function (text, target) {
      if (!text)
        return text;
      var match;
      var raw = text;
      var html = [];
      var writer = htmlSanitizeWriter(html);
      var url;
      var i;
      var properties = {};
      if (angular.isDefined(target)) {
        properties.target = target;
      }
      while (match = raw.match(LINKY_URL_REGEXP)) {
        url = match[0];
        if (match[2] == match[3])
          url = 'mailto:' + url;
        i = match.index;
        writer.chars(raw.substr(0, i));
        properties.href = url;
        writer.start('a', properties);
        writer.chars(match[0].replace(MAILTO_REGEXP, ''));
        writer.end('a');
        raw = raw.substring(i + match[0].length);
      }
      writer.chars(raw);
      return html.join('');
    };
  });
}(window, window.angular));
(function (window, angular, undefined) {
  'use strict';
  var ngRouteModule = angular.module('ngRoute', ['ng']).provider('$route', $RouteProvider);
  function $RouteProvider() {
    function inherit(parent, extra) {
      return angular.extend(new (angular.extend(function () {
      }, { prototype: parent }))(), extra);
    }
    var routes = {};
    this.when = function (path, route) {
      routes[path] = angular.extend({ reloadOnSearch: true }, route, path && pathRegExp(path, route));
      if (path) {
        var redirectPath = path[path.length - 1] == '/' ? path.substr(0, path.length - 1) : path + '/';
        routes[redirectPath] = angular.extend({ redirectTo: path }, pathRegExp(redirectPath, route));
      }
      return this;
    };
    function pathRegExp(path, opts) {
      var insensitive = opts.caseInsensitiveMatch, ret = {
          originalPath: path,
          regexp: path
        }, keys = ret.keys = [];
      path = path.replace(/([().])/g, '\\$1').replace(/(\/)?:(\w+)([\?|\*])?/g, function (_, slash, key, option) {
        var optional = option === '?' ? option : null;
        var star = option === '*' ? option : null;
        keys.push({
          name: key,
          optional: !!optional
        });
        slash = slash || '';
        return '' + (optional ? '' : slash) + '(?:' + (optional ? slash : '') + (star && '(.+?)' || '([^/]+)') + (optional || '') + ')' + (optional || '');
      }).replace(/([\/$\*])/g, '\\$1');
      ret.regexp = new RegExp('^' + path + '$', insensitive ? 'i' : '');
      return ret;
    }
    this.otherwise = function (params) {
      this.when(null, params);
      return this;
    };
    this.$get = [
      '$rootScope',
      '$location',
      '$routeParams',
      '$q',
      '$injector',
      '$http',
      '$templateCache',
      '$sce',
      function ($rootScope, $location, $routeParams, $q, $injector, $http, $templateCache, $sce) {
        var forceReload = false, $route = {
            routes: routes,
            reload: function () {
              forceReload = true;
              $rootScope.$evalAsync(updateRoute);
            }
          };
        $rootScope.$on('$locationChangeSuccess', updateRoute);
        return $route;
        function switchRouteMatcher(on, route) {
          var keys = route.keys, params = {};
          if (!route.regexp)
            return null;
          var m = route.regexp.exec(on);
          if (!m)
            return null;
          for (var i = 1, len = m.length; i < len; ++i) {
            var key = keys[i - 1];
            var val = 'string' == typeof m[i] ? decodeURIComponent(m[i]) : m[i];
            if (key && val) {
              params[key.name] = val;
            }
          }
          return params;
        }
        function updateRoute() {
          var next = parseRoute(), last = $route.current;
          if (next && last && next.$$route === last.$$route && angular.equals(next.pathParams, last.pathParams) && !next.reloadOnSearch && !forceReload) {
            last.params = next.params;
            angular.copy(last.params, $routeParams);
            $rootScope.$broadcast('$routeUpdate', last);
          } else if (next || last) {
            forceReload = false;
            $rootScope.$broadcast('$routeChangeStart', next, last);
            $route.current = next;
            if (next) {
              if (next.redirectTo) {
                if (angular.isString(next.redirectTo)) {
                  $location.path(interpolate(next.redirectTo, next.params)).search(next.params).replace();
                } else {
                  $location.url(next.redirectTo(next.pathParams, $location.path(), $location.search())).replace();
                }
              }
            }
            $q.when(next).then(function () {
              if (next) {
                var locals = angular.extend({}, next.resolve), template, templateUrl;
                angular.forEach(locals, function (value, key) {
                  locals[key] = angular.isString(value) ? $injector.get(value) : $injector.invoke(value);
                });
                if (angular.isDefined(template = next.template)) {
                  if (angular.isFunction(template)) {
                    template = template(next.params);
                  }
                } else if (angular.isDefined(templateUrl = next.templateUrl)) {
                  if (angular.isFunction(templateUrl)) {
                    templateUrl = templateUrl(next.params);
                  }
                  templateUrl = $sce.getTrustedResourceUrl(templateUrl);
                  if (angular.isDefined(templateUrl)) {
                    next.loadedTemplateUrl = templateUrl;
                    template = $http.get(templateUrl, { cache: $templateCache }).then(function (response) {
                      return response.data;
                    });
                  }
                }
                if (angular.isDefined(template)) {
                  locals['$template'] = template;
                }
                return $q.all(locals);
              }
            }).then(function (locals) {
              if (next == $route.current) {
                if (next) {
                  next.locals = locals;
                  angular.copy(next.params, $routeParams);
                }
                $rootScope.$broadcast('$routeChangeSuccess', next, last);
              }
            }, function (error) {
              if (next == $route.current) {
                $rootScope.$broadcast('$routeChangeError', next, last, error);
              }
            });
          }
        }
        function parseRoute() {
          var params, match;
          angular.forEach(routes, function (route, path) {
            if (!match && (params = switchRouteMatcher($location.path(), route))) {
              match = inherit(route, {
                params: angular.extend({}, $location.search(), params),
                pathParams: params
              });
              match.$$route = route;
            }
          });
          return match || routes[null] && inherit(routes[null], {
            params: {},
            pathParams: {}
          });
        }
        function interpolate(string, params) {
          var result = [];
          angular.forEach((string || '').split(':'), function (segment, i) {
            if (i === 0) {
              result.push(segment);
            } else {
              var segmentMatch = segment.match(/(\w+)(.*)/);
              var key = segmentMatch[1];
              result.push(params[key]);
              result.push(segmentMatch[2] || '');
              delete params[key];
            }
          });
          return result.join('');
        }
      }
    ];
  }
  ngRouteModule.provider('$routeParams', $RouteParamsProvider);
  function $RouteParamsProvider() {
    this.$get = function () {
      return {};
    };
  }
  ngRouteModule.directive('ngView', ngViewFactory);
  ngViewFactory.$inject = [
    '$route',
    '$anchorScroll',
    '$compile',
    '$controller',
    '$animate'
  ];
  function ngViewFactory($route, $anchorScroll, $compile, $controller, $animate) {
    return {
      restrict: 'ECA',
      terminal: true,
      priority: 400,
      transclude: 'element',
      link: function (scope, $element, attr, ctrl, $transclude) {
        var currentScope, currentElement, autoScrollExp = attr.autoscroll, onloadExp = attr.onload || '';
        scope.$on('$routeChangeSuccess', update);
        update();
        function cleanupLastView() {
          if (currentScope) {
            currentScope.$destroy();
            currentScope = null;
          }
          if (currentElement) {
            $animate.leave(currentElement);
            currentElement = null;
          }
        }
        function update() {
          var locals = $route.current && $route.current.locals, template = locals && locals.$template;
          if (template) {
            var newScope = scope.$new();
            $transclude(newScope, function (clone) {
              clone.html(template);
              $animate.enter(clone, null, currentElement || $element, function onNgViewEnter() {
                if (angular.isDefined(autoScrollExp) && (!autoScrollExp || scope.$eval(autoScrollExp))) {
                  $anchorScroll();
                }
              });
              cleanupLastView();
              var link = $compile(clone.contents()), current = $route.current;
              currentScope = current.scope = newScope;
              currentElement = clone;
              if (current.controller) {
                locals.$scope = currentScope;
                var controller = $controller(current.controller, locals);
                if (current.controllerAs) {
                  currentScope[current.controllerAs] = controller;
                }
                clone.data('$ngControllerController', controller);
                clone.children().data('$ngControllerController', controller);
              }
              link(currentScope);
              currentScope.$emit('$viewContentLoaded');
              currentScope.$eval(onloadExp);
            });
          } else {
            cleanupLastView();
          }
        }
      }
    };
  }
}(window, window.angular));
(function (A, s, B) {
  'use strict';
  s.module('ngAnimate', ['ng']).config([
    '$provide',
    '$animateProvider',
    function (N, D) {
      var z = s.noop, k = s.forEach, X = D.$$selectors, T = 1, f = '$$ngAnimateState', E = 'ng-animate', g = { running: !0 };
      N.decorator('$animate', [
        '$delegate',
        '$injector',
        '$sniffer',
        '$rootElement',
        '$timeout',
        '$rootScope',
        '$document',
        function (t, A, F, m, G, p, H) {
          function B(a) {
            if (a) {
              var d = [], b = {};
              a = a.substr(1).split('.');
              (F.transitions || F.animations) && a.push('');
              for (var c = 0; c < a.length; c++) {
                var h = a[c], f = X[h];
                f && !b[h] && (d.push(A.get(f)), b[h] = !0);
              }
              return d;
            }
          }
          function n(a, d, b, c, h, g, m) {
            function p(a) {
              g();
              if (!0 === a)
                u();
              else {
                if (a = b.data(f))
                  a.done = u, b.data(f, a);
                s(v, 'after', u);
              }
            }
            function s(c, h, g) {
              var f = h + 'End';
              k(c, function (k, t) {
                var e = function () {
                  a: {
                    var e = h + 'Complete', a = c[t];
                    a[e] = !0;
                    (a[f] || z)();
                    for (a = 0; a < c.length; a++)
                      if (!c[a][e])
                        break a;
                    g();
                  }
                };
                'before' != h || 'enter' != a && 'move' != a ? k[h] ? k[f] = n ? k[h](b, d, e) : k[h](b, e) : e() : e();
              });
            }
            function t() {
              m && G(m, 0, !1);
            }
            function u() {
              if (!u.hasBeenRun) {
                u.hasBeenRun = !0;
                var a = b.data(f);
                a && (n ? q(b) : (a.closeAnimationTimeout = G(function () {
                  q(b);
                }, 0, !1), b.data(f, a)));
                t();
              }
            }
            var r = (' ' + ((b.attr('class') || '') + ' ' + d)).replace(/\s+/g, '.');
            c || (c = h ? h.parent() : b.parent());
            h = B(r);
            var n = 'addClass' == a || 'removeClass' == a, r = b.data(f) || {};
            if (J(b, c) || 0 === h.length)
              g(), u();
            else {
              var v = [];
              r.running && n && r.structural || k(h, function (c) {
                if (!c.allowCancel || c.allowCancel(b, a, d)) {
                  var h = c[a];
                  'leave' == a ? (c = h, h = null) : c = c['before' + a.charAt(0).toUpperCase() + a.substr(1)];
                  v.push({
                    before: c,
                    after: h
                  });
                }
              });
              0 === v.length ? (g(), t()) : (r.running && (G.cancel(r.closeAnimationTimeout), q(b), K(r.animations), (r.done || z)(!0)), 'addClass' == a && b.hasClass(d) || 'removeClass' == a && !b.hasClass(d) ? (g(), t()) : (b.addClass(E), b.data(f, {
                running: !0,
                structural: !n,
                animations: v,
                done: p
              }), s(v, 'before', p)));
            }
          }
          function L(a) {
            a = a[0];
            a.nodeType == T && k(a.querySelectorAll('.' + E), function (a) {
              a = s.element(a);
              var b = a.data(f);
              b && (K(b.animations), q(a));
            });
          }
          function K(a) {
            k(a, function (d) {
              a.beforeComplete || (d.beforeEnd || z)(!0);
              a.afterComplete || (d.afterEnd || z)(!0);
            });
          }
          function q(a) {
            a[0] == m[0] ? g.disabled || (g.running = !1, g.structural = !1) : (a.removeClass(E), a.removeData(f));
          }
          function J(a, d) {
            if (g.disabled)
              return !0;
            if (a[0] == m[0])
              return g.disabled || g.running;
            do {
              if (0 === d.length)
                break;
              var b = d[0] == m[0], c = b ? g : d.data(f), c = c && (!!c.disabled || !!c.running);
              if (b || c)
                return c;
              if (b)
                break;
            } while (d = d.parent());
            return !0;
          }
          m.data(f, g);
          p.$$postDigest(function () {
            g.running = !1;
          });
          return {
            enter: function (a, d, b, c) {
              this.enabled(!1, a);
              t.enter(a, d, b);
              p.$$postDigest(function () {
                n('enter', 'ng-enter', a, d, b, z, c);
              });
            },
            leave: function (a, d) {
              L(a);
              this.enabled(!1, a);
              p.$$postDigest(function () {
                n('leave', 'ng-leave', a, null, null, function () {
                  t.leave(a);
                }, d);
              });
            },
            move: function (a, d, b, c) {
              L(a);
              this.enabled(!1, a);
              t.move(a, d, b);
              p.$$postDigest(function () {
                n('move', 'ng-move', a, d, b, z, c);
              });
            },
            addClass: function (a, d, b) {
              n('addClass', d, a, null, null, function () {
                t.addClass(a, d);
              }, b);
            },
            removeClass: function (a, d, b) {
              n('removeClass', d, a, null, null, function () {
                t.removeClass(a, d);
              }, b);
            },
            enabled: function (a, d) {
              switch (arguments.length) {
              case 2:
                if (a)
                  q(d);
                else {
                  var b = d.data(f) || {};
                  b.disabled = !0;
                  d.data(f, b);
                }
                break;
              case 1:
                g.disabled = !a;
                break;
              default:
                a = !g.disabled;
              }
              return !!a;
            }
          };
        }
      ]);
      D.register('', [
        '$window',
        '$sniffer',
        '$timeout',
        function (f, g, F) {
          function m(e) {
            Q.push(e);
            F.cancel(R);
            R = F(function () {
              k(Q, function (e) {
                e();
              });
              Q = [];
              R = null;
              C = {};
            }, 10, !1);
          }
          function G(e, a) {
            var w = e.getAttribute('style') || '';
            e.setAttribute('style', (0 < w.length ? '; ' : '') + a);
            return w;
          }
          function p(e, a) {
            var w = a ? C[a] : null;
            if (!w) {
              var b = 0, d = 0, c = 0, l = 0, g, n, m, p;
              k(e, function (e) {
                if (e.nodeType == T) {
                  e = f.getComputedStyle(e) || {};
                  m = e[h + D];
                  b = Math.max(H(m), b);
                  p = e[h + S];
                  g = e[h + u];
                  d = Math.max(H(g), d);
                  n = e[I + u];
                  l = Math.max(H(n), l);
                  var a = H(e[I + D]);
                  0 < a && (a *= parseInt(e[I + r], 10) || 1);
                  c = Math.max(a, c);
                }
              });
              w = {
                total: 0,
                transitionPropertyStyle: p,
                transitionDurationStyle: m,
                transitionDelayStyle: g,
                transitionDelay: d,
                transitionDuration: b,
                animationDelayStyle: n,
                animationDelay: l,
                animationDuration: c
              };
              a && (C[a] = w);
            }
            return w;
          }
          function H(e) {
            var a = 0;
            e = s.isString(e) ? e.split(/\s*,\s*/) : [];
            k(e, function (e) {
              a = Math.max(parseFloat(e) || 0, a);
            });
            return a;
          }
          function E(e) {
            var a = e.parent(), b = a.data(W);
            b || (a.data(W, ++V), b = V);
            return b + '-' + e[0].className;
          }
          function n(e, a) {
            var b = E(e), d = b + ' ' + a, c = {}, g = C[d] ? ++C[d].total : 0;
            if (0 < g) {
              var l = a + '-stagger', c = b + ' ' + l;
              (b = !C[c]) && e.addClass(l);
              c = p(e, c);
              b && e.removeClass(l);
            }
            e.addClass(a);
            d = p(e, d);
            l = Math.max(d.transitionDuration, d.animationDuration);
            if (0 === l)
              return e.removeClass(a), !1;
            var b = e[0], f = '';
            0 < d.transitionDuration && (e.addClass(U), f += N + ' ', b.style[h + S] = 'none');
            k(a.split(' '), function (a, e) {
              f += (0 < e ? ' ' : '') + a + '-active';
            });
            e.data(v, {
              className: a,
              activeClassName: f,
              maxDuration: l,
              classes: a + ' ' + f,
              timings: d,
              stagger: c,
              ii: g
            });
            return !0;
          }
          function L(a, b, w) {
            function f(a) {
              a.stopPropagation();
              a = a.originalEvent || a;
              var e = a.$manualTimeStamp || a.timeStamp || Date.now();
              Math.max(e - t, 0) >= p && a.elapsedTime >= n && w();
            }
            var x = a.data(v);
            if (a.hasClass(b) && x) {
              var M = a[0], l = x.timings, k = x.stagger, n = x.maxDuration, m = x.activeClassName, p = 1000 * Math.max(l.transitionDelay, l.animationDelay), t = Date.now(), s = P + ' ' + O, r, x = x.ii, u, y = '';
              if (0 < l.transitionDuration) {
                M.style[h + S] = '';
                var q = l.transitionPropertyStyle;
                -1 == q.indexOf('all') && (u = !0, y += c + 'transition-property: ' + q + ', ' + (g.msie ? '-ms-zoom' : 'clip') + '; ', y += c + 'transition-duration: ' + l.transitionDurationStyle + ', ' + l.transitionDuration + 's; ');
              }
              0 < x && (0 < k.transitionDelay && 0 === k.transitionDuration && (q = l.transitionDelayStyle, u && (q += ', ' + l.transitionDelay + 's'), y += c + 'transition-delay: ' + K(q, k.transitionDelay, x) + '; '), 0 < k.animationDelay && 0 === k.animationDuration && (y += c + 'animation-delay: ' + K(l.animationDelayStyle, k.animationDelay, x) + '; '));
              0 < y.length && (r = G(M, y));
              a.on(s, f);
              a.addClass(m);
              return function (c) {
                a.off(s, f);
                a.removeClass(m);
                d(a, b);
                null != r && (0 < r.length ? M.setAttribute('style', r) : M.removeAttribute('style'));
              };
            }
            w();
          }
          function K(a, b, d) {
            var c = '';
            k(a.split(','), function (a, e) {
              c += (0 < e ? ',' : '') + (d * b + parseInt(a, 10)) + 's';
            });
            return c;
          }
          function q(a, b) {
            if (n(a, b))
              return function (c) {
                c && d(a, b);
              };
          }
          function J(a, b, c) {
            if (a.data(v))
              return L(a, b, c);
            d(a, b);
            c();
          }
          function a(a, b, c) {
            var d = q(a, b);
            if (d) {
              var f = d;
              m(function () {
                f = J(a, b, c);
              });
              return function (a) {
                (f || z)(a);
              };
            }
            c();
          }
          function d(a, b) {
            a.removeClass(b);
            a.removeClass(U);
            a.removeData(v);
          }
          function b(a, b) {
            var c = '';
            a = s.isArray(a) ? a : a.split(/\s+/);
            k(a, function (a, e) {
              a && 0 < a.length && (c += (0 < e ? ' ' : '') + a + b);
            });
            return c;
          }
          var c = '', h, O, I, P;
          A.ontransitionend === B && A.onwebkittransitionend !== B ? (c = '-webkit-', h = 'WebkitTransition', O = 'webkitTransitionEnd transitionend') : (h = 'transition', O = 'transitionend');
          A.onanimationend === B && A.onwebkitanimationend !== B ? (c = '-webkit-', I = 'WebkitAnimation', P = 'webkitAnimationEnd animationend') : (I = 'animation', P = 'animationend');
          var D = 'Duration', S = 'Property', u = 'Delay', r = 'IterationCount', W = '$$ngAnimateKey', v = '$$ngAnimateCSS3Data', U = 'ng-animate-start', N = 'ng-animate-active', C = {}, V = 0, Q = [], R;
          return {
            allowCancel: function (a, c, d) {
              var f = (a.data(v) || {}).classes;
              if (!f || 0 <= [
                  'enter',
                  'leave',
                  'move'
                ].indexOf(c))
                return !0;
              var h = a.parent(), g = s.element(a[0].cloneNode());
              g.attr('style', 'position:absolute; top:-9999px; left:-9999px');
              g.removeAttr('id');
              g.html('');
              k(f.split(' '), function (a) {
                g.removeClass(a);
              });
              g.addClass(b(d, 'addClass' == c ? '-add' : '-remove'));
              h.append(g);
              a = p(g);
              g.remove();
              return 0 < Math.max(a.transitionDuration, a.animationDuration);
            },
            enter: function (b, c) {
              return a(b, 'ng-enter', c);
            },
            leave: function (b, c) {
              return a(b, 'ng-leave', c);
            },
            move: function (b, c) {
              return a(b, 'ng-move', c);
            },
            beforeAddClass: function (a, c, d) {
              if (a = q(a, b(c, '-add')))
                return m(d), a;
              d();
            },
            addClass: function (a, c, d) {
              return J(a, b(c, '-add'), d);
            },
            beforeRemoveClass: function (a, c, d) {
              if (a = q(a, b(c, '-remove')))
                return m(d), a;
              d();
            },
            removeClass: function (a, c, d) {
              return J(a, b(c, '-remove'), d);
            }
          };
        }
      ]);
    }
  ]);
}(window, window.angular));
(function () {
  function g(a) {
    throw a;
  }
  var j = void 0, k = !0, l = null, o = !1;
  function aa(a) {
    return function () {
      return this[a];
    };
  }
  function r(a) {
    return function () {
      return a;
    };
  }
  var s, ba = this;
  function ca() {
  }
  function da(a) {
    a.mb = function () {
      return a.bd ? a.bd : a.bd = new a();
    };
  }
  function ea(a) {
    var b = typeof a;
    if ('object' == b)
      if (a) {
        if (a instanceof Array)
          return 'array';
        if (a instanceof Object)
          return b;
        var c = Object.prototype.toString.call(a);
        if ('[object Window]' == c)
          return 'object';
        if ('[object Array]' == c || 'number' == typeof a.length && 'undefined' != typeof a.splice && 'undefined' != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable('splice'))
          return 'array';
        if ('[object Function]' == c || 'undefined' != typeof a.call && 'undefined' != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable('call'))
          return 'function';
      } else
        return 'null';
    else if ('function' == b && 'undefined' == typeof a.call)
      return 'object';
    return b;
  }
  function u(a) {
    return a !== j;
  }
  function fa(a) {
    var b = ea(a);
    return 'array' == b || 'object' == b && 'number' == typeof a.length;
  }
  function v(a) {
    return 'string' == typeof a;
  }
  function ga(a) {
    return 'number' == typeof a;
  }
  function ha(a) {
    var b = typeof a;
    return 'object' == b && a != l || 'function' == b;
  }
  Math.floor(2147483648 * Math.random()).toString(36);
  function ia(a, b, c) {
    return a.call.apply(a.bind, arguments);
  }
  function ja(a, b, c) {
    a || g(Error());
    if (2 < arguments.length) {
      var d = Array.prototype.slice.call(arguments, 2);
      return function () {
        var c = Array.prototype.slice.call(arguments);
        Array.prototype.unshift.apply(c, d);
        return a.apply(b, c);
      };
    }
    return function () {
      return a.apply(b, arguments);
    };
  }
  function w(a, b, c) {
    w = Function.prototype.bind && -1 != Function.prototype.bind.toString().indexOf('native code') ? ia : ja;
    return w.apply(l, arguments);
  }
  function ka(a, b) {
    function c() {
    }
    c.prototype = b.prototype;
    a.Vd = b.prototype;
    a.prototype = new c();
  }
  ;
  function la(a) {
    a = String(a);
    if (/^\s*$/.test(a) ? 0 : /^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g, '@').replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x10-\x1f\x80-\x9f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g, '')))
      try {
        return eval('(' + a + ')');
      } catch (b) {
      }
    g(Error('Invalid JSON string: ' + a));
  }
  function ma() {
    this.dc = j;
  }
  function na(a, b, c) {
    switch (typeof b) {
    case 'string':
      oa(b, c);
      break;
    case 'number':
      c.push(isFinite(b) && !isNaN(b) ? b : 'null');
      break;
    case 'boolean':
      c.push(b);
      break;
    case 'undefined':
      c.push('null');
      break;
    case 'object':
      if (b == l) {
        c.push('null');
        break;
      }
      if ('array' == ea(b)) {
        var d = b.length;
        c.push('[');
        for (var e = '', f = 0; f < d; f++)
          c.push(e), e = b[f], na(a, a.dc ? a.dc.call(b, String(f), e) : e, c), e = ',';
        c.push(']');
        break;
      }
      c.push('{');
      d = '';
      for (f in b)
        Object.prototype.hasOwnProperty.call(b, f) && (e = b[f], 'function' != typeof e && (c.push(d), oa(f, c), c.push(':'), na(a, a.dc ? a.dc.call(b, f, e) : e, c), d = ','));
      c.push('}');
      break;
    case 'function':
      break;
    default:
      g(Error('Unknown type: ' + typeof b));
    }
  }
  var pa = {
      '"': '\\"',
      '\\': '\\\\',
      '/': '\\/',
      '\b': '\\b',
      '\f': '\\f',
      '\n': '\\n',
      '\r': '\\r',
      '\t': '\\t',
      '\x0B': '\\u000b'
    }, qa = /\uffff/.test('\uffff') ? /[\\\"\x00-\x1f\x7f-\uffff]/g : /[\\\"\x00-\x1f\x7f-\xff]/g;
  function oa(a, b) {
    b.push('"', a.replace(qa, function (a) {
      if (a in pa)
        return pa[a];
      var b = a.charCodeAt(0), e = '\\u';
      16 > b ? e += '000' : 256 > b ? e += '00' : 4096 > b && (e += '0');
      return pa[a] = e + b.toString(16);
    }), '"');
  }
  ;
  function y(a) {
    if ('undefined' !== typeof JSON && u(JSON.stringify))
      a = JSON.stringify(a);
    else {
      var b = [];
      na(new ma(), a, b);
      a = b.join('');
    }
    return a;
  }
  ;
  function ra(a) {
    for (var b = [], c = 0, d = 0; d < a.length; d++) {
      var e = a.charCodeAt(d);
      55296 <= e && 56319 >= e && (e -= 55296, d++, z(d < a.length, 'Surrogate pair missing trail surrogate.'), e = 65536 + (e << 10) + (a.charCodeAt(d) - 56320));
      128 > e ? b[c++] = e : (2048 > e ? b[c++] = e >> 6 | 192 : (65536 > e ? b[c++] = e >> 12 | 224 : (b[c++] = e >> 18 | 240, b[c++] = e >> 12 & 63 | 128), b[c++] = e >> 6 & 63 | 128), b[c++] = e & 63 | 128);
    }
    return b;
  }
  ;
  function A(a, b, c, d) {
    var e;
    d < b ? e = 'at least ' + b : d > c && (e = 0 === c ? 'none' : 'no more than ' + c);
    e && g(Error(a + ' failed: Was called with ' + d + (1 === d ? ' argument.' : ' arguments.') + ' Expects ' + e + '.'));
  }
  function B(a, b, c) {
    var d = '';
    switch (b) {
    case 1:
      d = c ? 'first' : 'First';
      break;
    case 2:
      d = c ? 'second' : 'Second';
      break;
    case 3:
      d = c ? 'third' : 'Third';
      break;
    case 4:
      d = c ? 'fourth' : 'Fourth';
      break;
    default:
      sa.assert(o, 'errorPrefix_ called with argumentNumber > 4.  Need to update it?');
    }
    return a + ' failed: ' + (d + ' argument ');
  }
  function C(a, b, c, d) {
    (!d || u(c)) && 'function' != ea(c) && g(Error(B(a, b, d) + 'must be a valid function.'));
  }
  function ta(a, b, c) {
    u(c) && (!ha(c) || c === l) && g(Error(B(a, b, k) + 'must be a valid context object.'));
  }
  ;
  function D(a, b) {
    return Object.prototype.hasOwnProperty.call(a, b);
  }
  function ua(a, b) {
    if (Object.prototype.hasOwnProperty.call(a, b))
      return a[b];
  }
  ;
  var sa = {}, va = /[\[\].#$\/]/, wa = /[\[\].#$]/;
  function xa(a) {
    return v(a) && 0 !== a.length && !va.test(a);
  }
  function ya(a, b, c) {
    (!c || u(b)) && za(B(a, 1, c), b);
  }
  function za(a, b, c, d) {
    c || (c = 0);
    d || (d = []);
    u(b) || g(Error(a + 'contains undefined' + Aa(d)));
    'function' == ea(b) && g(Error(a + 'contains a function' + Aa(d) + ' with contents: ' + b.toString()));
    Ba(b) && g(Error(a + 'contains ' + b.toString() + Aa(d)));
    1000 < c && g(new TypeError(a + 'contains a cyclic object value (' + d.slice(0, 100).join('.') + '...)'));
    v(b) && (b.length > 10485760 / 3 && 10485760 < ra(b).length) && g(Error(a + 'contains a string greater than 10485760 utf8 bytes' + Aa(d) + ' (\'' + b.substring(0, 50) + '...\')'));
    if (ha(b))
      for (var e in b)
        D(b, e) && ('.priority' !== e && ('.value' !== e && '.sv' !== e && !xa(e)) && g(Error(a + 'contains an invalid key (' + e + ')' + Aa(d) + '.  Keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]"')), d.push(e), za(a, b[e], c + 1, d), d.pop());
  }
  function Aa(a) {
    return 0 == a.length ? '' : ' in property \'' + a.join('.') + '\'';
  }
  function Ca(a, b) {
    ha(b) || g(Error(B(a, 1, o) + ' must be an object containing the children to replace.'));
    ya(a, b, o);
  }
  function Da(a, b, c, d) {
    if (!d || u(c))
      c !== l && (!ga(c) && !v(c) && (!ha(c) || !D(c, '.sv'))) && g(Error(B(a, b, d) + 'must be a valid firebase priority (a string, number, or null).'));
  }
  function Ea(a, b, c) {
    if (!c || u(b))
      switch (b) {
      case 'value':
      case 'child_added':
      case 'child_removed':
      case 'child_changed':
      case 'child_moved':
        break;
      default:
        g(Error(B(a, 1, c) + 'must be a valid event type: "value", "child_added", "child_removed", "child_changed", or "child_moved".'));
      }
  }
  function Fa(a, b) {
    u(b) && !xa(b) && g(Error(B(a, 2, k) + 'was an invalid key: "' + b + '".  Firebase keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]").'));
  }
  function Ga(a, b) {
    (!v(b) || 0 === b.length || wa.test(b)) && g(Error(B(a, 1, o) + 'was an invalid path: "' + b + '". Paths must be non-empty strings and can\'t contain ".", "#", "$", "[", or "]"'));
  }
  function E(a, b) {
    '.info' === F(b) && g(Error(a + ' failed: Can\'t modify data under /.info/'));
  }
  ;
  function H(a, b, c, d, e, f, h) {
    this.n = a;
    this.path = b;
    this.Ba = c;
    this.ca = d;
    this.ua = e;
    this.za = f;
    this.Sa = h;
    u(this.ca) && (u(this.za) && u(this.Ba)) && g('Query: Can\'t combine startAt(), endAt(), and limit().');
  }
  H.prototype.Kc = function () {
    A('Query.ref', 0, 0, arguments.length);
    return new J(this.n, this.path);
  };
  H.prototype.ref = H.prototype.Kc;
  H.prototype.Ya = function (a, b) {
    A('Query.on', 2, 4, arguments.length);
    Ea('Query.on', a, o);
    C('Query.on', 2, b, o);
    var c = Ha('Query.on', arguments[2], arguments[3]);
    this.n.Nb(this, a, b, c.cancel, c.T);
    return b;
  };
  H.prototype.on = H.prototype.Ya;
  H.prototype.vb = function (a, b, c) {
    A('Query.off', 0, 3, arguments.length);
    Ea('Query.off', a, k);
    C('Query.off', 2, b, k);
    ta('Query.off', 3, c);
    this.n.cc(this, a, b, c);
  };
  H.prototype.off = H.prototype.vb;
  H.prototype.Id = function (a, b) {
    function c(h) {
      f && (f = o, e.vb(a, c), b.call(d.T, h));
    }
    A('Query.once', 2, 4, arguments.length);
    Ea('Query.once', a, o);
    C('Query.once', 2, b, o);
    var d = Ha('Query.once', arguments[2], arguments[3]), e = this, f = k;
    this.Ya(a, c, function (b) {
      e.vb(a, c);
      d.cancel && d.cancel.call(d.T, b);
    });
  };
  H.prototype.once = H.prototype.Id;
  H.prototype.Bd = function (a) {
    A('Query.limit', 1, 1, arguments.length);
    (!ga(a) || Math.floor(a) !== a || 0 >= a) && g('Query.limit: First argument must be a positive integer.');
    return new H(this.n, this.path, a, this.ca, this.ua, this.za, this.Sa);
  };
  H.prototype.limit = H.prototype.Bd;
  H.prototype.Rd = function (a, b) {
    A('Query.startAt', 0, 2, arguments.length);
    Da('Query.startAt', 1, a, k);
    Fa('Query.startAt', b);
    u(a) || (b = a = l);
    return new H(this.n, this.path, this.Ba, a, b, this.za, this.Sa);
  };
  H.prototype.startAt = H.prototype.Rd;
  H.prototype.wd = function (a, b) {
    A('Query.endAt', 0, 2, arguments.length);
    Da('Query.endAt', 1, a, k);
    Fa('Query.endAt', b);
    return new H(this.n, this.path, this.Ba, this.ca, this.ua, a, b);
  };
  H.prototype.endAt = H.prototype.wd;
  function Ia(a) {
    var b = {};
    u(a.ca) && (b.sp = a.ca);
    u(a.ua) && (b.sn = a.ua);
    u(a.za) && (b.ep = a.za);
    u(a.Sa) && (b.en = a.Sa);
    u(a.Ba) && (b.l = a.Ba);
    u(a.ca) && (u(a.ua) && a.ca === l && a.ua === l) && (b.vf = 'l');
    return b;
  }
  H.prototype.La = function () {
    var a = Ja(Ia(this));
    return '{}' === a ? 'default' : a;
  };
  function Ha(a, b, c) {
    var d = {};
    b && c ? (d.cancel = b, C(a, 3, d.cancel, k), d.T = c, ta(a, 4, d.T)) : b && ('object' === typeof b && b !== l ? d.T = b : 'function' === typeof b ? d.cancel = b : g(Error(B(a, 3, k) + 'must either be a cancel callback or a context object.')));
    return d;
  }
  ;
  function K(a) {
    if (a instanceof K)
      return a;
    if (1 == arguments.length) {
      this.m = a.split('/');
      for (var b = 0, c = 0; c < this.m.length; c++)
        0 < this.m[c].length && (this.m[b] = this.m[c], b++);
      this.m.length = b;
      this.Z = 0;
    } else
      this.m = arguments[0], this.Z = arguments[1];
  }
  function F(a) {
    return a.Z >= a.m.length ? l : a.m[a.Z];
  }
  function Ka(a) {
    var b = a.Z;
    b < a.m.length && b++;
    return new K(a.m, b);
  }
  s = K.prototype;
  s.toString = function () {
    for (var a = '', b = this.Z; b < this.m.length; b++)
      '' !== this.m[b] && (a += '/' + this.m[b]);
    return a || '/';
  };
  s.parent = function () {
    if (this.Z >= this.m.length)
      return l;
    for (var a = [], b = this.Z; b < this.m.length - 1; b++)
      a.push(this.m[b]);
    return new K(a, 0);
  };
  s.F = function (a) {
    for (var b = [], c = this.Z; c < this.m.length; c++)
      b.push(this.m[c]);
    if (a instanceof K)
      for (c = a.Z; c < a.m.length; c++)
        b.push(a.m[c]);
    else {
      a = a.split('/');
      for (c = 0; c < a.length; c++)
        0 < a[c].length && b.push(a[c]);
    }
    return new K(b, 0);
  };
  s.f = function () {
    return this.Z >= this.m.length;
  };
  function La(a, b) {
    var c = F(a);
    if (c === l)
      return b;
    if (c === F(b))
      return La(Ka(a), Ka(b));
    g('INTERNAL ERROR: innerPath (' + b + ') is not within outerPath (' + a + ')');
  }
  s.contains = function (a) {
    var b = 0;
    if (this.m.length > a.m.length)
      return o;
    for (; b < this.m.length;) {
      if (this.m[b] !== a.m[b])
        return o;
      ++b;
    }
    return k;
  };
  function Ma() {
    this.children = {};
    this.pc = 0;
    this.value = l;
  }
  function Na(a, b, c) {
    this.Ca = a ? a : '';
    this.Bb = b ? b : l;
    this.z = c ? c : new Ma();
  }
  function L(a, b) {
    for (var c = b instanceof K ? b : new K(b), d = a, e; (e = F(c)) !== l;)
      d = new Na(e, d, ua(d.z.children, e) || new Ma()), c = Ka(c);
    return d;
  }
  s = Na.prototype;
  s.k = function () {
    return this.z.value;
  };
  function M(a, b) {
    z('undefined' !== typeof b);
    a.z.value = b;
    Oa(a);
  }
  s.nb = function () {
    return 0 < this.z.pc;
  };
  s.f = function () {
    return this.k() === l && !this.nb();
  };
  s.w = function (a) {
    for (var b in this.z.children)
      a(new Na(b, this, this.z.children[b]));
  };
  function Pa(a, b, c, d) {
    c && !d && b(a);
    a.w(function (a) {
      Pa(a, b, k, d);
    });
    c && d && b(a);
  }
  function Qa(a, b, c) {
    for (a = c ? a : a.parent(); a !== l;) {
      if (b(a))
        return k;
      a = a.parent();
    }
    return o;
  }
  s.path = function () {
    return new K(this.Bb === l ? this.Ca : this.Bb.path() + '/' + this.Ca);
  };
  s.name = aa('Ca');
  s.parent = aa('Bb');
  function Oa(a) {
    if (a.Bb !== l) {
      var b = a.Bb, c = a.Ca, d = a.f(), e = D(b.z.children, c);
      d && e ? (delete b.z.children[c], b.z.pc--, Oa(b)) : !d && !e && (b.z.children[c] = a.z, b.z.pc++, Oa(b));
    }
  }
  ;
  function Ra(a, b) {
    this.Pa = a ? a : Sa;
    this.ba = b ? b : Ta;
  }
  function Sa(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  s = Ra.prototype;
  s.na = function (a, b) {
    return new Ra(this.Pa, this.ba.na(a, b, this.Pa).copy(l, l, o, l, l));
  };
  s.remove = function (a) {
    return new Ra(this.Pa, this.ba.remove(a, this.Pa).copy(l, l, o, l, l));
  };
  s.get = function (a) {
    for (var b, c = this.ba; !c.f();) {
      b = this.Pa(a, c.key);
      if (0 === b)
        return c.value;
      0 > b ? c = c.left : 0 < b && (c = c.right);
    }
    return l;
  };
  function Ua(a, b) {
    for (var c, d = a.ba, e = l; !d.f();) {
      c = a.Pa(b, d.key);
      if (0 === c) {
        if (d.left.f())
          return e ? e.key : l;
        for (d = d.left; !d.right.f();)
          d = d.right;
        return d.key;
      }
      0 > c ? d = d.left : 0 < c && (e = d, d = d.right);
    }
    g(Error('Attempted to find predecessor key for a nonexistent key.  What gives?'));
  }
  s.f = function () {
    return this.ba.f();
  };
  s.count = function () {
    return this.ba.count();
  };
  s.tb = function () {
    return this.ba.tb();
  };
  s.Wa = function () {
    return this.ba.Wa();
  };
  s.Aa = function (a) {
    return this.ba.Aa(a);
  };
  s.Ma = function (a) {
    return this.ba.Ma(a);
  };
  s.Va = function (a) {
    return new Va(this.ba, a);
  };
  function Va(a, b) {
    this.jd = b;
    for (this.Rb = []; !a.f();)
      this.Rb.push(a), a = a.left;
  }
  function Wa(a) {
    if (0 === a.Rb.length)
      return l;
    var b = a.Rb.pop(), c;
    c = a.jd ? a.jd(b.key, b.value) : {
      key: b.key,
      value: b.value
    };
    for (b = b.right; !b.f();)
      a.Rb.push(b), b = b.left;
    return c;
  }
  function Xa(a, b, c, d, e) {
    this.key = a;
    this.value = b;
    this.color = c != l ? c : k;
    this.left = d != l ? d : Ta;
    this.right = e != l ? e : Ta;
  }
  s = Xa.prototype;
  s.copy = function (a, b, c, d, e) {
    return new Xa(a != l ? a : this.key, b != l ? b : this.value, c != l ? c : this.color, d != l ? d : this.left, e != l ? e : this.right);
  };
  s.count = function () {
    return this.left.count() + 1 + this.right.count();
  };
  s.f = r(o);
  s.Aa = function (a) {
    return this.left.Aa(a) || a(this.key, this.value) || this.right.Aa(a);
  };
  s.Ma = function (a) {
    return this.right.Ma(a) || a(this.key, this.value) || this.left.Ma(a);
  };
  function Ya(a) {
    return a.left.f() ? a : Ya(a.left);
  }
  s.tb = function () {
    return Ya(this).key;
  };
  s.Wa = function () {
    return this.right.f() ? this.key : this.right.Wa();
  };
  s.na = function (a, b, c) {
    var d, e;
    e = this;
    d = c(a, e.key);
    e = 0 > d ? e.copy(l, l, l, e.left.na(a, b, c), l) : 0 === d ? e.copy(l, b, l, l, l) : e.copy(l, l, l, l, e.right.na(a, b, c));
    return Za(e);
  };
  function bb(a) {
    if (a.left.f())
      return Ta;
    !a.left.O() && !a.left.left.O() && (a = cb(a));
    a = a.copy(l, l, l, bb(a.left), l);
    return Za(a);
  }
  s.remove = function (a, b) {
    var c, d;
    c = this;
    if (0 > b(a, c.key))
      !c.left.f() && (!c.left.O() && !c.left.left.O()) && (c = cb(c)), c = c.copy(l, l, l, c.left.remove(a, b), l);
    else {
      c.left.O() && (c = db(c));
      !c.right.f() && (!c.right.O() && !c.right.left.O()) && (c = eb(c), c.left.left.O() && (c = db(c), c = eb(c)));
      if (0 === b(a, c.key)) {
        if (c.right.f())
          return Ta;
        d = Ya(c.right);
        c = c.copy(d.key, d.value, l, l, bb(c.right));
      }
      c = c.copy(l, l, l, l, c.right.remove(a, b));
    }
    return Za(c);
  };
  s.O = aa('color');
  function Za(a) {
    a.right.O() && !a.left.O() && (a = fb(a));
    a.left.O() && a.left.left.O() && (a = db(a));
    a.left.O() && a.right.O() && (a = eb(a));
    return a;
  }
  function cb(a) {
    a = eb(a);
    a.right.left.O() && (a = a.copy(l, l, l, l, db(a.right)), a = fb(a), a = eb(a));
    return a;
  }
  function fb(a) {
    var b;
    b = a.copy(l, l, k, l, a.right.left);
    return a.right.copy(l, l, a.color, b, l);
  }
  function db(a) {
    var b;
    b = a.copy(l, l, k, a.left.right, l);
    return a.left.copy(l, l, a.color, l, b);
  }
  function eb(a) {
    var b, c;
    b = a.left.copy(l, l, !a.left.color, l, l);
    c = a.right.copy(l, l, !a.right.color, l, l);
    return a.copy(l, l, !a.color, b, c);
  }
  function gb() {
  }
  s = gb.prototype;
  s.copy = function () {
    return this;
  };
  s.na = function (a, b) {
    return new Xa(a, b, j, j, j);
  };
  s.remove = function () {
    return this;
  };
  s.count = r(0);
  s.f = r(k);
  s.Aa = r(o);
  s.Ma = r(o);
  s.tb = r(l);
  s.Wa = r(l);
  s.O = r(o);
  var Ta = new gb();
  var hb = Array.prototype, ib = hb.forEach ? function (a, b, c) {
      hb.forEach.call(a, b, c);
    } : function (a, b, c) {
      for (var d = a.length, e = v(a) ? a.split('') : a, f = 0; f < d; f++)
        f in e && b.call(c, e[f], f, a);
    }, jb = hb.map ? function (a, b, c) {
      return hb.map.call(a, b, c);
    } : function (a, b, c) {
      for (var d = a.length, e = Array(d), f = v(a) ? a.split('') : a, h = 0; h < d; h++)
        h in f && (e[h] = b.call(c, f[h], h, a));
      return e;
    };
  function kb() {
  }
  ;
  function lb() {
    this.B = [];
    this.oc = [];
    this.rd = [];
    this.Xb = [];
    this.Xb[0] = 128;
    for (var a = 1; 64 > a; ++a)
      this.Xb[a] = 0;
    this.reset();
  }
  ka(lb, kb);
  lb.prototype.reset = function () {
    this.B[0] = 1732584193;
    this.B[1] = 4023233417;
    this.B[2] = 2562383102;
    this.B[3] = 271733878;
    this.B[4] = 3285377520;
    this.Sc = this.ob = 0;
  };
  function mb(a, b) {
    var c;
    c || (c = 0);
    for (var d = a.rd, e = c; e < c + 64; e += 4)
      d[e / 4] = b[e] << 24 | b[e + 1] << 16 | b[e + 2] << 8 | b[e + 3];
    for (e = 16; 80 > e; e++) {
      var f = d[e - 3] ^ d[e - 8] ^ d[e - 14] ^ d[e - 16];
      d[e] = (f << 1 | f >>> 31) & 4294967295;
    }
    c = a.B[0];
    for (var h = a.B[1], i = a.B[2], m = a.B[3], n = a.B[4], p, e = 0; 80 > e; e++)
      40 > e ? 20 > e ? (f = m ^ h & (i ^ m), p = 1518500249) : (f = h ^ i ^ m, p = 1859775393) : 60 > e ? (f = h & i | m & (h | i), p = 2400959708) : (f = h ^ i ^ m, p = 3395469782), f = (c << 5 | c >>> 27) + f + n + p + d[e] & 4294967295, n = m, m = i, i = (h << 30 | h >>> 2) & 4294967295, h = c, c = f;
    a.B[0] = a.B[0] + c & 4294967295;
    a.B[1] = a.B[1] + h & 4294967295;
    a.B[2] = a.B[2] + i & 4294967295;
    a.B[3] = a.B[3] + m & 4294967295;
    a.B[4] = a.B[4] + n & 4294967295;
  }
  lb.prototype.update = function (a, b) {
    u(b) || (b = a.length);
    var c = this.oc, d = this.ob, e = 0;
    if (v(a))
      for (; e < b;)
        c[d++] = a.charCodeAt(e++), 64 == d && (mb(this, c), d = 0);
    else
      for (; e < b;)
        c[d++] = a[e++], 64 == d && (mb(this, c), d = 0);
    this.ob = d;
    this.Sc += b;
  };
  function nb() {
    this.Oa = {};
    this.length = 0;
  }
  nb.prototype.setItem = function (a, b) {
    D(this.Oa, a) || (this.length += 1);
    this.Oa[a] = b;
  };
  nb.prototype.getItem = function (a) {
    return D(this.Oa, a) ? this.Oa[a] : l;
  };
  nb.prototype.removeItem = function (a) {
    D(this.Oa, a) && (this.length -= 1, delete this.Oa[a]);
  };
  var ob = l;
  try {
    'undefined' !== typeof sessionStorage && (sessionStorage.setItem('firebase-sentinel', 'cache'), sessionStorage.removeItem('firebase-sentinel'), ob = sessionStorage);
  } catch (pb) {
  }
  ob = ob || new nb();
  function qb(a, b, c, d) {
    this.host = a.toLowerCase();
    this.domain = this.host.substr(this.host.indexOf('.') + 1);
    this.ec = b;
    this.ub = c;
    this.ea = d || ob.getItem(a) || this.host;
  }
  function rb(a, b) {
    b !== a.ea && (a.ea = b, 's-' === a.ea.substr(0, 2) && ob.setItem(a.host, a.ea));
  }
  qb.prototype.toString = function () {
    return (this.ec ? 'https://' : 'http://') + this.host;
  };
  var sb, tb, ub, vb;
  function wb() {
    return ba.navigator ? ba.navigator.userAgent : l;
  }
  vb = ub = tb = sb = o;
  var xb;
  if (xb = wb()) {
    var yb = ba.navigator;
    sb = 0 == xb.indexOf('Opera');
    tb = !sb && -1 != xb.indexOf('MSIE');
    ub = !sb && -1 != xb.indexOf('WebKit');
    vb = !sb && !ub && 'Gecko' == yb.product;
  }
  var zb = tb, Ab = vb, Bb = ub;
  var Cb;
  if (sb && ba.opera) {
    var Db = ba.opera.version;
    'function' == typeof Db && Db();
  } else
    Ab ? Cb = /rv\:([^\);]+)(\)|;)/ : zb ? Cb = /MSIE\s+([^\);]+)(\)|;)/ : Bb && (Cb = /WebKit\/(\S+)/), Cb && Cb.exec(wb());
  var Eb = l, Fb = l;
  function Gb(a, b) {
    fa(a) || g(Error('encodeByteArray takes an array as a parameter'));
    if (!Eb) {
      Eb = {};
      Fb = {};
      for (var c = 0; 65 > c; c++)
        Eb[c] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.charAt(c), Fb[c] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.'.charAt(c);
    }
    for (var c = b ? Fb : Eb, d = [], e = 0; e < a.length; e += 3) {
      var f = a[e], h = e + 1 < a.length, i = h ? a[e + 1] : 0, m = e + 2 < a.length, n = m ? a[e + 2] : 0, p = f >> 2, f = (f & 3) << 4 | i >> 4, i = (i & 15) << 2 | n >> 6, n = n & 63;
      m || (n = 64, h || (i = 64));
      d.push(c[p], c[f], c[i], c[n]);
    }
    return d.join('');
  }
  ;
  var Hb, Ib = 1;
  Hb = function () {
    return Ib++;
  };
  function z(a, b) {
    a || g(Error('Firebase INTERNAL ASSERT FAILED:' + b));
  }
  function Jb(a) {
    var b = ra(a), a = new lb();
    a.update(b);
    var b = [], c = 8 * a.Sc;
    56 > a.ob ? a.update(a.Xb, 56 - a.ob) : a.update(a.Xb, 64 - (a.ob - 56));
    for (var d = 63; 56 <= d; d--)
      a.oc[d] = c & 255, c /= 256;
    mb(a, a.oc);
    for (d = c = 0; 5 > d; d++)
      for (var e = 24; 0 <= e; e -= 8)
        b[c++] = a.B[d] >> e & 255;
    return Gb(b);
  }
  function Kb() {
    for (var a = '', b = 0; b < arguments.length; b++)
      a = fa(arguments[b]) ? a + Kb.apply(l, arguments[b]) : 'object' === typeof arguments[b] ? a + y(arguments[b]) : a + arguments[b], a += ' ';
    return a;
  }
  var Lb = l, Mb = k;
  function N() {
    Mb === k && (Mb = o, Lb === l && 'true' === ob.getItem('logging_enabled') && Nb(k));
    if (Lb) {
      var a = Kb.apply(l, arguments);
      Lb(a);
    }
  }
  function Ob(a) {
    return function () {
      N(a, arguments);
    };
  }
  function Pb() {
    if ('undefined' !== typeof console) {
      var a = 'FIREBASE INTERNAL ERROR: ' + Kb.apply(l, arguments);
      'undefined' !== typeof console.error ? console.error(a) : console.log(a);
    }
  }
  function Qb() {
    var a = Kb.apply(l, arguments);
    g(Error('FIREBASE FATAL ERROR: ' + a));
  }
  function P() {
    if ('undefined' !== typeof console) {
      var a = 'FIREBASE WARNING: ' + Kb.apply(l, arguments);
      'undefined' !== typeof console.warn ? console.warn(a) : console.log(a);
    }
  }
  function Ba(a) {
    return ga(a) && (a != a || a == Number.POSITIVE_INFINITY || a == Number.NEGATIVE_INFINITY);
  }
  function Rb(a, b) {
    return a !== b ? a === l ? -1 : b === l ? 1 : typeof a !== typeof b ? 'number' === typeof a ? -1 : 1 : a > b ? 1 : -1 : 0;
  }
  function Sb(a, b) {
    if (a === b)
      return 0;
    var c = Tb(a), d = Tb(b);
    return c !== l ? d !== l ? c - d : -1 : d !== l ? 1 : a < b ? -1 : 1;
  }
  function Ub(a, b) {
    if (b && a in b)
      return b[a];
    g(Error('Missing required key (' + a + ') in object: ' + y(b)));
  }
  function Ja(a) {
    if ('object' !== typeof a || a === l)
      return y(a);
    var b = [], c;
    for (c in a)
      b.push(c);
    b.sort();
    c = '{';
    for (var d = 0; d < b.length; d++)
      0 !== d && (c += ','), c += y(b[d]), c += ':', c += Ja(a[b[d]]);
    return c + '}';
  }
  function Vb(a, b) {
    if (a.length <= b)
      return [a];
    for (var c = [], d = 0; d < a.length; d += b)
      d + b > a ? c.push(a.substring(d, a.length)) : c.push(a.substring(d, d + b));
    return c;
  }
  function Wb(a, b) {
    if ('array' == ea(a))
      for (var c = 0; c < a.length; ++c)
        b(c, a[c]);
    else
      Xb(a, b);
  }
  function Yb(a) {
    z(!Ba(a));
    var b, c, d, e;
    0 === a ? (d = c = 0, b = -Infinity === 1 / a ? 1 : 0) : (b = 0 > a, a = Math.abs(a), a >= Math.pow(2, -1022) ? (d = Math.min(Math.floor(Math.log(a) / Math.LN2), 1023), c = d + 1023, d = Math.round(a * Math.pow(2, 52 - d) - Math.pow(2, 52))) : (c = 0, d = Math.round(a / Math.pow(2, -1074))));
    e = [];
    for (a = 52; a; a -= 1)
      e.push(d % 2 ? 1 : 0), d = Math.floor(d / 2);
    for (a = 11; a; a -= 1)
      e.push(c % 2 ? 1 : 0), c = Math.floor(c / 2);
    e.push(b ? 1 : 0);
    e.reverse();
    b = e.join('');
    c = '';
    for (a = 0; 64 > a; a += 8)
      d = parseInt(b.substr(a, 8), 2).toString(16), 1 === d.length && (d = '0' + d), c += d;
    return c.toLowerCase();
  }
  var Zb = /^-?\d{1,10}$/;
  function Tb(a) {
    return Zb.test(a) && (a = Number(a), -2147483648 <= a && 2147483647 >= a) ? a : l;
  }
  function $b(a) {
    try {
      a();
    } catch (b) {
      setTimeout(function () {
        g(b);
      });
    }
  }
  ;
  function ac(a, b) {
    this.D = a;
    z(this.D !== l, 'LeafNode shouldn\'t be created with null value.');
    this.Za = 'undefined' !== typeof b ? b : l;
  }
  s = ac.prototype;
  s.N = r(k);
  s.j = aa('Za');
  s.Ea = function (a) {
    return new ac(this.D, a);
  };
  s.M = function () {
    return Q;
  };
  s.Q = function (a) {
    return F(a) === l ? this : Q;
  };
  s.da = r(l);
  s.G = function (a, b) {
    return new R().G(a, b).Ea(this.Za);
  };
  s.xa = function (a, b) {
    var c = F(a);
    return c === l ? b : this.G(c, Q.xa(Ka(a), b));
  };
  s.f = r(o);
  s.Sb = r(0);
  s.V = function (a) {
    return a && this.j() !== l ? {
      '.value': this.k(),
      '.priority': this.j()
    } : this.k();
  };
  s.hash = function () {
    var a = '';
    this.j() !== l && (a += 'priority:' + bc(this.j()) + ':');
    var b = typeof this.D, a = a + (b + ':'), a = 'number' === b ? a + Yb(this.D) : a + this.D;
    return Jb(a);
  };
  s.k = aa('D');
  s.toString = function () {
    return 'string' === typeof this.D ? '"' + this.D + '"' : this.D;
  };
  function cc(a, b) {
    return Rb(a.ha, b.ha) || Sb(a.name, b.name);
  }
  function dc(a, b) {
    return Sb(a.name, b.name);
  }
  function ec(a, b) {
    return Sb(a, b);
  }
  ;
  function R(a, b) {
    this.o = a || new Ra(ec);
    this.Za = 'undefined' !== typeof b ? b : l;
  }
  s = R.prototype;
  s.N = r(o);
  s.j = aa('Za');
  s.Ea = function (a) {
    return new R(this.o, a);
  };
  s.G = function (a, b) {
    var c = this.o.remove(a);
    b && b.f() && (b = l);
    b !== l && (c = c.na(a, b));
    return b && b.j() !== l ? new fc(c, l, this.Za) : new R(c, this.Za);
  };
  s.xa = function (a, b) {
    var c = F(a);
    if (c === l)
      return b;
    var d = this.M(c).xa(Ka(a), b);
    return this.G(c, d);
  };
  s.f = function () {
    return this.o.f();
  };
  s.Sb = function () {
    return this.o.count();
  };
  var gc = /^\d+$/;
  s = R.prototype;
  s.V = function (a) {
    if (this.f())
      return l;
    var b = {}, c = 0, d = 0, e = k;
    this.w(function (f, h) {
      b[f] = h.V(a);
      c++;
      e && gc.test(f) ? d = Math.max(d, Number(f)) : e = o;
    });
    if (!a && e && d < 2 * c) {
      var f = [], h;
      for (h in b)
        f[h] = b[h];
      return f;
    }
    a && this.j() !== l && (b['.priority'] = this.j());
    return b;
  };
  s.hash = function () {
    var a = '';
    this.j() !== l && (a += 'priority:' + bc(this.j()) + ':');
    this.w(function (b, c) {
      var d = c.hash();
      '' !== d && (a += ':' + b + ':' + d);
    });
    return '' === a ? '' : Jb(a);
  };
  s.M = function (a) {
    a = this.o.get(a);
    return a === l ? Q : a;
  };
  s.Q = function (a) {
    var b = F(a);
    return b === l ? this : this.M(b).Q(Ka(a));
  };
  s.da = function (a) {
    return Ua(this.o, a);
  };
  s.$c = function () {
    return this.o.tb();
  };
  s.ad = function () {
    return this.o.Wa();
  };
  s.w = function (a) {
    return this.o.Aa(a);
  };
  s.vc = function (a) {
    return this.o.Ma(a);
  };
  s.Va = function () {
    return this.o.Va();
  };
  s.toString = function () {
    var a = '{', b = k;
    this.w(function (c, d) {
      b ? b = o : a += ', ';
      a += '"' + c + '" : ' + d.toString();
    });
    return a += '}';
  };
  var Q = new R();
  function fc(a, b, c) {
    R.call(this, a, c);
    b === l && (b = new Ra(cc), a.Aa(function (a, c) {
      b = b.na({
        name: a,
        ha: c.j()
      }, c);
    }));
    this.ta = b;
  }
  ka(fc, R);
  s = fc.prototype;
  s.G = function (a, b) {
    var c = this.M(a), d = this.o, e = this.ta;
    c !== l && (d = d.remove(a), e = e.remove({
      name: a,
      ha: c.j()
    }));
    b && b.f() && (b = l);
    b !== l && (d = d.na(a, b), e = e.na({
      name: a,
      ha: b.j()
    }, b));
    return new fc(d, e, this.j());
  };
  s.da = function (a, b) {
    var c = Ua(this.ta, {
        name: a,
        ha: b.j()
      });
    return c ? c.name : l;
  };
  s.w = function (a) {
    return this.ta.Aa(function (b, c) {
      return a(b.name, c);
    });
  };
  s.vc = function (a) {
    return this.ta.Ma(function (b, c) {
      return a(b.name, c);
    });
  };
  s.Va = function () {
    return this.ta.Va(function (a, b) {
      return {
        key: a.name,
        value: b
      };
    });
  };
  s.$c = function () {
    return this.ta.f() ? l : this.ta.tb().name;
  };
  s.ad = function () {
    return this.ta.f() ? l : this.ta.Wa().name;
  };
  function S(a, b) {
    if (a === l)
      return Q;
    var c = l;
    'object' === typeof a && '.priority' in a ? c = a['.priority'] : 'undefined' !== typeof b && (c = b);
    z(c === l || 'string' === typeof c || 'number' === typeof c || 'object' === typeof c && '.sv' in c);
    'object' === typeof a && ('.value' in a && a['.value'] !== l) && (a = a['.value']);
    if ('object' !== typeof a || '.sv' in a)
      return new ac(a, c);
    if (a instanceof Array) {
      var d = Q;
      Xb(a, function (b, c) {
        if (D(a, c) && '.' !== c.substring(0, 1)) {
          var e = S(b);
          if (e.N() || !e.f())
            d = d.G(c, e);
        }
      });
      return d.Ea(c);
    }
    var e = [], f = {}, h = o;
    Wb(a, function (b, c) {
      if ('string' !== typeof c || '.' !== c.substring(0, 1)) {
        var d = S(a[c]);
        d.f() || (h = h || d.j() !== l, e.push({
          name: c,
          ha: d.j()
        }), f[c] = d);
      }
    });
    var i = hc(e, f, o);
    if (h) {
      var m = hc(e, f, k);
      return new fc(i, m, c);
    }
    return new R(i, c);
  }
  var ic = Math.log(2);
  function jc(a) {
    this.count = parseInt(Math.log(a + 1) / ic);
    this.Xc = this.count - 1;
    this.td = a + 1 & parseInt(Array(this.count + 1).join('1'), 2);
  }
  function hc(a, b, c) {
    function d(d, f) {
      var h = n - d, p = n;
      n -= d;
      var q = a[h].name, h = new Xa(c ? a[h] : q, b[q], f, l, e(h + 1, p));
      i ? i.left = h : m = h;
      i = h;
    }
    function e(d, f) {
      var h = f - d;
      if (0 == h)
        return l;
      if (1 == h) {
        var h = a[d].name, i = c ? a[d] : h;
        return new Xa(i, b[h], o, l, l);
      }
      var i = parseInt(h / 2) + d, m = e(d, i), n = e(i + 1, f), h = a[i].name, i = c ? a[i] : h;
      return new Xa(i, b[h], o, m, n);
    }
    var f = c ? cc : dc;
    a.sort(f);
    var h, f = new jc(a.length), i = l, m = l, n = a.length;
    for (h = 0; h < f.count; ++h) {
      var p = !(f.td & 1 << f.Xc);
      f.Xc--;
      var q = Math.pow(2, f.count - (h + 1));
      p ? d(q, o) : (d(q, o), d(q, k));
    }
    h = m;
    f = c ? cc : ec;
    return h !== l ? new Ra(f, h) : new Ra(f);
  }
  function bc(a) {
    return 'number' === typeof a ? 'number:' + Yb(a) : 'string:' + a;
  }
  ;
  function T(a, b) {
    this.z = a;
    this.bc = b;
  }
  T.prototype.V = function () {
    A('Firebase.DataSnapshot.val', 0, 0, arguments.length);
    return this.z.V();
  };
  T.prototype.val = T.prototype.V;
  T.prototype.xd = function () {
    A('Firebase.DataSnapshot.exportVal', 0, 0, arguments.length);
    return this.z.V(k);
  };
  T.prototype.exportVal = T.prototype.xd;
  T.prototype.F = function (a) {
    A('Firebase.DataSnapshot.child', 0, 1, arguments.length);
    ga(a) && (a = String(a));
    Ga('Firebase.DataSnapshot.child', a);
    var b = new K(a), c = this.bc.F(b);
    return new T(this.z.Q(b), c);
  };
  T.prototype.child = T.prototype.F;
  T.prototype.zc = function (a) {
    A('Firebase.DataSnapshot.hasChild', 1, 1, arguments.length);
    Ga('Firebase.DataSnapshot.hasChild', a);
    var b = new K(a);
    return !this.z.Q(b).f();
  };
  T.prototype.hasChild = T.prototype.zc;
  T.prototype.j = function () {
    A('Firebase.DataSnapshot.getPriority', 0, 0, arguments.length);
    return this.z.j();
  };
  T.prototype.getPriority = T.prototype.j;
  T.prototype.forEach = function (a) {
    A('Firebase.DataSnapshot.forEach', 1, 1, arguments.length);
    C('Firebase.DataSnapshot.forEach', 1, a, o);
    if (this.z.N())
      return o;
    var b = this;
    return this.z.w(function (c, d) {
      return a(new T(d, b.bc.F(c)));
    });
  };
  T.prototype.forEach = T.prototype.forEach;
  T.prototype.nb = function () {
    A('Firebase.DataSnapshot.hasChildren', 0, 0, arguments.length);
    return this.z.N() ? o : !this.z.f();
  };
  T.prototype.hasChildren = T.prototype.nb;
  T.prototype.name = function () {
    A('Firebase.DataSnapshot.name', 0, 0, arguments.length);
    return this.bc.name();
  };
  T.prototype.name = T.prototype.name;
  T.prototype.Sb = function () {
    A('Firebase.DataSnapshot.numChildren', 0, 0, arguments.length);
    return this.z.Sb();
  };
  T.prototype.numChildren = T.prototype.Sb;
  T.prototype.Kc = function () {
    A('Firebase.DataSnapshot.ref', 0, 0, arguments.length);
    return this.bc;
  };
  T.prototype.ref = T.prototype.Kc;
  function kc(a) {
    z('array' == ea(a) && 0 < a.length);
    this.sd = a;
    this.sb = {};
  }
  kc.prototype.xc = function () {
  };
  kc.prototype.Uc = function (a) {
    for (var b = this.sb[a] || [], c = 0; c < b.length; c++)
      b[c].W.apply(b[c].T, Array.prototype.slice.call(arguments, 1));
  };
  kc.prototype.Ya = function (a, b, c) {
    mc(this, a);
    this.sb[a] = this.sb[a] || [];
    this.sb[a].push({
      W: b,
      T: c
    });
    (a = this.xc(a)) && b.apply(c, a);
  };
  kc.prototype.vb = function (a, b, c) {
    mc(this, a);
    for (var a = this.sb[a] || [], d = 0; d < a.length; d++)
      if (a[d].W === b && (!c || c === a[d].T)) {
        a.splice(d, 1);
        break;
      }
  };
  function mc(a, b) {
    var c = a.sd, d;
    a: {
      d = function (a) {
        return a === b;
      };
      for (var e = c.length, f = v(c) ? c.split('') : c, h = 0; h < e; h++)
        if (h in f && d.call(j, f[h])) {
          d = h;
          break a;
        }
      d = -1;
    }
    z(0 > d ? l : v(c) ? c.charAt(d) : c[d], 'Unknown event: ' + b);
  }
  ;
  function nc() {
    kc.call(this, ['visible']);
    var a, b;
    'undefined' !== typeof document && 'undefined' !== typeof document.addEventListener && ('undefined' !== typeof document.hidden ? (b = 'visibilitychange', a = 'hidden') : 'undefined' !== typeof document.mozHidden ? (b = 'mozvisibilitychange', a = 'mozHidden') : 'undefined' !== typeof document.msHidden ? (b = 'msvisibilitychange', a = 'msHidden') : 'undefined' !== typeof document.webkitHidden && (b = 'webkitvisibilitychange', a = 'webkitHidden'));
    this.hb = k;
    if (b) {
      var c = this;
      document.addEventListener(b, function () {
        var b = !document[a];
        if (b !== c.hb) {
          c.hb = b;
          c.Uc('visible', b);
        }
      }, o);
    }
  }
  ka(nc, kc);
  da(nc);
  nc.prototype.xc = function (a) {
    z('visible' === a);
    return [this.hb];
  };
  function oc(a) {
    this.Gc = a;
    this.Zb = [];
    this.Ra = 0;
    this.qc = -1;
    this.Ja = l;
  }
  ;
  function Xb(a, b) {
    for (var c in a)
      b.call(j, a[c], c, a);
  }
  function pc(a) {
    var b = {}, c;
    for (c in a)
      b[c] = a[c];
    return b;
  }
  ;
  function qc() {
    this.jb = {};
  }
  function rc(a, b, c) {
    u(c) || (c = 1);
    D(a.jb, b) || (a.jb[b] = 0);
    a.jb[b] += c;
  }
  qc.prototype.get = function () {
    return pc(this.jb);
  };
  function sc(a) {
    this.ud = a;
    this.Qb = l;
  }
  sc.prototype.get = function () {
    var a = this.ud.get(), b = pc(a);
    if (this.Qb)
      for (var c in this.Qb)
        b[c] -= this.Qb[c];
    this.Qb = a;
    return b;
  };
  function tc(a, b) {
    this.Pc = {};
    this.hc = new sc(a);
    this.u = b;
    setTimeout(w(this.gd, this), 10 + 60000 * Math.random());
  }
  tc.prototype.gd = function () {
    var a = this.hc.get(), b = {}, c = o, d;
    for (d in a)
      0 < a[d] && D(this.Pc, d) && (b[d] = a[d], c = k);
    c && (a = this.u, a.P && (b = { c: b }, a.e('reportStats', b), a.Da('s', b)));
    setTimeout(w(this.gd, this), 600000 * Math.random());
  };
  var uc = {}, vc = {};
  function wc(a) {
    a = a.toString();
    uc[a] || (uc[a] = new qc());
    return uc[a];
  }
  ;
  var xc = l;
  'undefined' !== typeof MozWebSocket ? xc = MozWebSocket : 'undefined' !== typeof WebSocket && (xc = WebSocket);
  function yc(a, b, c) {
    this.rc = a;
    this.e = Ob(this.rc);
    this.frames = this.qb = l;
    this.Rc = 0;
    this.$ = wc(b);
    this.Qa = (b.ec ? 'wss://' : 'ws://') + b.ea + '/.ws?v=5';
    b.host !== b.ea && (this.Qa = this.Qa + '&ns=' + b.ub);
    c && (this.Qa = this.Qa + '&s=' + c);
  }
  var zc;
  yc.prototype.open = function (a, b) {
    this.ga = b;
    this.Fd = a;
    this.e('websocket connecting to ' + this.Qa);
    this.Y = new xc(this.Qa);
    this.kb = o;
    var c = this;
    this.Y.onopen = function () {
      c.e('Websocket connected.');
      c.kb = k;
    };
    this.Y.onclose = function () {
      c.e('Websocket connection was disconnected.');
      c.Y = l;
      c.Ka();
    };
    this.Y.onmessage = function (a) {
      if (c.Y !== l)
        if (a = a.data, rc(c.$, 'bytes_received', a.length), Ac(c), c.frames !== l)
          Bc(c, a);
        else {
          a: {
            z(c.frames === l, 'We already have a frame buffer');
            if (4 >= a.length) {
              var b = Number(a);
              if (!isNaN(b)) {
                c.Rc = b;
                c.frames = [];
                a = l;
                break a;
              }
            }
            c.Rc = 1;
            c.frames = [];
          }
          a !== l && Bc(c, a);
        }
    };
    this.Y.onerror = function (a) {
      c.e('WebSocket error.  Closing connection.');
      a.data && c.e(a.data);
      c.Ka();
    };
  };
  yc.prototype.start = function () {
  };
  yc.isAvailable = function () {
    return !('undefined' !== typeof navigator && 'Opera' === navigator.appName) && xc !== l && !zc;
  };
  function Bc(a, b) {
    a.frames.push(b);
    if (a.frames.length == a.Rc) {
      var c = a.frames.join('');
      a.frames = l;
      c = 'undefined' !== typeof JSON && u(JSON.parse) ? JSON.parse(c) : la(c);
      a.Fd(c);
    }
  }
  yc.prototype.send = function (a) {
    Ac(this);
    a = y(a);
    rc(this.$, 'bytes_sent', a.length);
    a = Vb(a, 16384);
    1 < a.length && this.Y.send(String(a.length));
    for (var b = 0; b < a.length; b++)
      this.Y.send(a[b]);
  };
  yc.prototype.Jb = function () {
    this.Ia = k;
    this.qb && (clearInterval(this.qb), this.qb = l);
    this.Y && (this.Y.close(), this.Y = l);
  };
  yc.prototype.Ka = function () {
    this.Ia || (this.e('WebSocket is closing itself'), this.Jb(), this.ga && (this.ga(this.kb), this.ga = l));
  };
  yc.prototype.close = function () {
    this.Ia || (this.e('WebSocket is being closed'), this.Jb());
  };
  function Ac(a) {
    clearInterval(a.qb);
    a.qb = setInterval(function () {
      a.Y.send('0');
      Ac(a);
    }, 45000);
  }
  ;
  function Cc() {
    this.set = {};
  }
  s = Cc.prototype;
  s.add = function (a, b) {
    this.set[a] = b !== l ? b : k;
  };
  s.contains = function (a) {
    return D(this.set, a);
  };
  s.get = function (a) {
    return this.contains(a) ? this.set[a] : j;
  };
  s.remove = function (a) {
    delete this.set[a];
  };
  s.f = function () {
    var a;
    a: {
      for (a in this.set) {
        a = o;
        break a;
      }
      a = k;
    }
    return a;
  };
  s.count = function () {
    var a = 0, b;
    for (b in this.set)
      a++;
    return a;
  };
  function Dc(a, b) {
    for (var c in a.set)
      D(a.set, c) && b(c, a.set[c]);
  }
  s.keys = function () {
    var a = [], b;
    for (b in this.set)
      D(this.set, b) && a.push(b);
    return a;
  };
  var Ec = 'pLPCommand', Fc = 'pRTLPCB';
  function Gc(a, b, c) {
    this.rc = a;
    this.e = Ob(a);
    this.Ud = b;
    this.$ = wc(b);
    this.gc = c;
    this.kb = o;
    this.Mb = function (a) {
      b.host !== b.ea && (a.ns = b.ub);
      var c = [], f;
      for (f in a)
        a.hasOwnProperty(f) && c.push(f + '=' + a[f]);
      return (b.ec ? 'https://' : 'http://') + b.ea + '/.lp?' + c.join('&');
    };
  }
  var Hc, Ic;
  Gc.prototype.open = function (a, b) {
    function c() {
      if (!d.Ia) {
        d.ja = new Jc(function (a, b, c, e, f) {
          rc(d.$, 'bytes_received', y(arguments).length);
          if (d.ja)
            if (d.Fa && (clearTimeout(d.Fa), d.Fa = l), d.kb = k, 'start' == a)
              d.id = b, d.fd = c;
            else if ('close' === a)
              if (b) {
                d.ja.fc = o;
                var h = d.cd;
                h.qc = b;
                h.Ja = function () {
                  d.Ka();
                };
                h.qc < h.Ra && (h.Ja(), h.Ja = l);
              } else
                d.Ka();
            else
              g(Error('Unrecognized command received: ' + a));
        }, function (a, b) {
          rc(d.$, 'bytes_received', y(arguments).length);
          var c = d.cd;
          for (c.Zb[a] = b; c.Zb[c.Ra];) {
            var e = c.Zb[c.Ra];
            delete c.Zb[c.Ra];
            for (var f = 0; f < e.length; ++f)
              if (e[f]) {
                var h = c;
                $b(function () {
                  h.Gc(e[f]);
                });
              }
            if (c.Ra === c.qc) {
              c.Ja && (clearTimeout(c.Ja), c.Ja(), c.Ja = l);
              break;
            }
            c.Ra++;
          }
        }, function () {
          d.Ka();
        }, d.Mb);
        var a = { start: 't' };
        a.ser = Math.floor(100000000 * Math.random());
        d.ja.jc && (a.cb = d.ja.jc);
        a.v = '5';
        d.gc && (a.s = d.gc);
        a = d.Mb(a);
        d.e('Connecting via long-poll to ' + a);
        Kc(d.ja, a, function () {
        });
      }
    }
    this.Wc = 0;
    this.R = b;
    this.cd = new oc(a);
    this.Ia = o;
    var d = this;
    this.Fa = setTimeout(function () {
      d.e('Timed out trying to connect.');
      d.Ka();
      d.Fa = l;
    }, 30000);
    if ('complete' === document.readyState)
      c();
    else {
      var e = o, f = function () {
          document.body ? e || (e = k, c()) : setTimeout(f, 10);
        };
      document.addEventListener ? (document.addEventListener('DOMContentLoaded', f, o), window.addEventListener('load', f, o)) : document.attachEvent && (document.attachEvent('onreadystatechange', function () {
        'complete' === document.readyState && f();
      }, o), window.attachEvent('onload', f, o));
    }
  };
  Gc.prototype.start = function () {
    var a = this.ja, b = this.fd;
    a.Dd = this.id;
    a.Ed = b;
    for (a.mc = k; Lc(a););
    a = this.id;
    b = this.fd;
    this.Xa = document.createElement('iframe');
    var c = { dframe: 't' };
    c.id = a;
    c.pw = b;
    a = this.Mb(c);
    this.Xa.src = a;
    this.Xa.style.display = 'none';
    document.body.appendChild(this.Xa);
  };
  Gc.isAvailable = function () {
    return !Ic && !('object' === typeof window && window.chrome && window.chrome.extension && !/^chrome/.test(window.location.href)) && !('object' === typeof Windows && 'object' === typeof Windows.Td) && (Hc || k);
  };
  Gc.prototype.Jb = function () {
    this.Ia = k;
    this.ja && (this.ja.close(), this.ja = l);
    this.Xa && (document.body.removeChild(this.Xa), this.Xa = l);
    this.Fa && (clearTimeout(this.Fa), this.Fa = l);
  };
  Gc.prototype.Ka = function () {
    this.Ia || (this.e('Longpoll is closing itself'), this.Jb(), this.R && (this.R(this.kb), this.R = l));
  };
  Gc.prototype.close = function () {
    this.Ia || (this.e('Longpoll is being closed.'), this.Jb());
  };
  Gc.prototype.send = function (a) {
    a = y(a);
    rc(this.$, 'bytes_sent', a.length);
    for (var a = ra(a), a = Gb(a, k), a = Vb(a, 1840), b = 0; b < a.length; b++) {
      var c = this.ja;
      c.Db.push({
        Nd: this.Wc,
        Sd: a.length,
        Yc: a[b]
      });
      c.mc && Lc(c);
      this.Wc++;
    }
  };
  function Jc(a, b, c, d) {
    this.Mb = d;
    this.ga = c;
    this.Ic = new Cc();
    this.Db = [];
    this.sc = Math.floor(100000000 * Math.random());
    this.fc = k;
    this.jc = Hb();
    window[Ec + this.jc] = a;
    window[Fc + this.jc] = b;
    a = document.createElement('iframe');
    a.style.display = 'none';
    if (document.body) {
      document.body.appendChild(a);
      try {
        a.contentWindow.document || N('No IE domain setting required');
      } catch (e) {
        a.src = 'javascript:void((function(){document.open();document.domain=\'' + document.domain + '\';document.close();})())';
      }
    } else
      g('Document body has not initialized. Wait to initialize Firebase until after the document is ready.');
    a.contentDocument ? a.ya = a.contentDocument : a.contentWindow ? a.ya = a.contentWindow.document : a.document && (a.ya = a.document);
    this.X = a;
    a = '';
    this.X.src && 'javascript:' === this.X.src.substr(0, 11) && (a = '<script>document.domain="' + document.domain + '";</script>');
    a = '<html><body>' + a + '</body></html>';
    try {
      this.X.ya.open(), this.X.ya.write(a), this.X.ya.close();
    } catch (f) {
      N('frame writing exception'), f.stack && N(f.stack), N(f);
    }
  }
  Jc.prototype.close = function () {
    this.mc = o;
    if (this.X) {
      this.X.ya.body.innerHTML = '';
      var a = this;
      setTimeout(function () {
        a.X !== l && (document.body.removeChild(a.X), a.X = l);
      }, 0);
    }
    var b = this.ga;
    b && (this.ga = l, b());
  };
  function Lc(a) {
    if (a.mc && a.fc && a.Ic.count() < (0 < a.Db.length ? 2 : 1)) {
      a.sc++;
      var b = {};
      b.id = a.Dd;
      b.pw = a.Ed;
      b.ser = a.sc;
      for (var b = a.Mb(b), c = '', d = 0; 0 < a.Db.length;)
        if (1870 >= a.Db[0].Yc.length + 30 + c.length) {
          var e = a.Db.shift(), c = c + '&seg' + d + '=' + e.Nd + '&ts' + d + '=' + e.Sd + '&d' + d + '=' + e.Yc;
          d++;
        } else
          break;
      var b = b + c, f = a.sc;
      a.Ic.add(f);
      var h = function () {
          a.Ic.remove(f);
          Lc(a);
        }, i = setTimeout(h, 25000);
      Kc(a, b, function () {
        clearTimeout(i);
        h();
      });
      return k;
    }
    return o;
  }
  function Kc(a, b, c) {
    setTimeout(function () {
      try {
        if (a.fc) {
          var d = a.X.ya.createElement('script');
          d.type = 'text/javascript';
          d.async = k;
          d.src = b;
          d.onload = d.onreadystatechange = function () {
            var a = d.readyState;
            if (!a || 'loaded' === a || 'complete' === a)
              d.onload = d.onreadystatechange = l, d.parentNode && d.parentNode.removeChild(d), c();
          };
          d.onerror = function () {
            N('Long-poll script failed to load: ' + b);
            a.fc = o;
            a.close();
          };
          a.X.ya.body.appendChild(d);
        }
      } catch (e) {
      }
    }, 1);
  }
  ;
  function Mc() {
    var a = [];
    Wb(Nc, function (b, c) {
      c && c.isAvailable() && a.push(c);
    });
    this.ic = a;
  }
  var Nc = [
      Gc,
      { isAvailable: r(o) },
      yc
    ];
  function Oc(a, b, c, d, e, f) {
    this.id = a;
    this.e = Ob('c:' + this.id + ':');
    this.Gc = c;
    this.yb = d;
    this.R = e;
    this.Fc = f;
    this.K = b;
    this.Yb = [];
    this.Vc = 0;
    this.Tc = new Mc();
    this.va = 0;
    this.e('Connection created');
    Pc(this);
  }
  function Pc(a) {
    var b;
    var c = a.Tc;
    0 < c.ic.length ? b = c.ic[0] : g(Error('No transports available'));
    a.L = new b('c:' + a.id + ':' + a.Vc++, a.K);
    var d = Qc(a, a.L), e = Rc(a, a.L);
    a.Kb = a.L;
    a.Ib = a.L;
    a.A = l;
    setTimeout(function () {
      a.L && a.L.open(d, e);
    }, 0);
  }
  function Rc(a, b) {
    return function (c) {
      b === a.L ? (a.L = l, !c && 0 === a.va ? (a.e('Realtime connection failed.'), 's-' === a.K.ea.substr(0, 2) && (ob.removeItem(a.K.ub), a.K.ea = a.K.host)) : 1 === a.va && a.e('Realtime connection lost.'), a.close()) : b === a.A ? (c = a.A, a.A = l, (a.Kb === c || a.Ib === c) && a.close()) : a.e('closing an old connection');
    };
  }
  function Qc(a, b) {
    return function (c) {
      if (2 != a.va)
        if (b === a.Ib) {
          var d = Ub('t', c), c = Ub('d', c);
          if ('c' == d) {
            if (d = Ub('t', c), 'd' in c)
              if (c = c.d, 'h' === d) {
                var d = c.ts, e = c.v, f = c.h;
                a.gc = c.s;
                rb(a.K, f);
                if (0 == a.va && (a.L.start(), c = a.L, a.e('Realtime connection established.'), a.L = c, a.va = 1, a.yb && (a.yb(d), a.yb = l), '5' !== e && P('Protocol version mismatch detected'), c = 1 < a.Tc.ic.length ? a.Tc.ic[1] : l))
                  a.A = new c('c:' + a.id + ':' + a.Vc++, a.K, a.gc), a.A.open(Qc(a, a.A), Rc(a, a.A));
              } else if ('n' === d) {
                a.e('recvd end transmission on primary');
                a.Ib = a.A;
                for (c = 0; c < a.Yb.length; ++c)
                  a.Vb(a.Yb[c]);
                a.Yb = [];
                Sc(a);
              } else
                's' === d ? (a.e('Connection shutdown command received. Shutting down...'), a.Fc && (a.Fc(c), a.Fc = l), a.R = l, a.close()) : 'r' === d ? (a.e('Reset packet received.  New host: ' + c), rb(a.K, c), 1 === a.va ? a.close() : (Tc(a), Pc(a))) : 'e' === d ? Pb('Server Error: ' + c) : Pb('Unknown control packet command: ' + d);
          } else
            'd' == d && a.Vb(c);
        } else
          b === a.A ? (d = Ub('t', c), c = Ub('d', c), 'c' == d ? 't' in c && (c = c.t, 'a' === c ? (a.A.start(), a.e('sending client ack on secondary'), a.A.send({
            t: 'c',
            d: {
              t: 'a',
              d: {}
            }
          }), a.e('Ending transmission on primary'), a.L.send({
            t: 'c',
            d: {
              t: 'n',
              d: {}
            }
          }), a.Kb = a.A, Sc(a)) : 'r' === c && (a.e('Got a reset on secondary, closing it'), a.A.close(), (a.Kb === a.A || a.Ib === a.A) && a.close())) : 'd' == d ? a.Yb.push(c) : g(Error('Unknown protocol layer: ' + d))) : a.e('message on old connection');
    };
  }
  Oc.prototype.ld = function (a) {
    a = {
      t: 'd',
      d: a
    };
    1 !== this.va && g('Connection is not connected');
    this.Kb.send(a);
  };
  function Sc(a) {
    a.Kb === a.A && a.Ib === a.A && (a.e('cleaning up and promoting a connection: ' + a.A.rc), a.L = a.A, a.A = l);
  }
  Oc.prototype.Vb = function (a) {
    this.Gc(a);
  };
  Oc.prototype.close = function () {
    2 !== this.va && (this.e('Closing realtime connection.'), this.va = 2, Tc(this), this.R && (this.R(), this.R = l));
  };
  function Tc(a) {
    a.e('Shutting down all connections');
    a.L && (a.L.close(), a.L = l);
    a.A && (a.A.close(), a.A = l);
  }
  ;
  function Vc() {
    kc.call(this, ['online']);
    this.zb = k;
    if ('undefined' !== typeof window && 'undefined' !== typeof window.addEventListener) {
      var a = this;
      window.addEventListener('online', function () {
        a.zb || a.Uc('online', k);
        a.zb = k;
      }, o);
      window.addEventListener('offline', function () {
        a.zb && a.Uc('online', o);
        a.zb = o;
      }, o);
    }
  }
  ka(Vc, kc);
  da(Vc);
  Vc.prototype.xc = function (a) {
    z('online' === a);
    return [this.zb];
  };
  function Wc(a, b, c, d, e, f) {
    this.id = Xc++;
    this.e = Ob('p:' + this.id + ':');
    this.Na = k;
    this.fa = {};
    this.U = [];
    this.Ab = 0;
    this.xb = [];
    this.P = o;
    this.pa = 1000;
    this.Wb = b || ca;
    this.Ub = c || ca;
    this.wb = d || ca;
    this.Hc = e || ca;
    this.yc = f || ca;
    this.K = a;
    this.Lc = l;
    this.Hb = {};
    this.Md = 0;
    this.rb = this.Cc = l;
    Yc(this, 0);
    nc.mb().Ya('visible', this.Hd, this);
    -1 === a.host.indexOf('fblocal') && Vc.mb().Ya('online', this.Gd, this);
  }
  var Xc = 0, Zc = 0;
  s = Wc.prototype;
  s.Da = function (a, b, c) {
    var d = ++this.Md, a = {
        r: d,
        a: a,
        b: b
      };
    this.e(y(a));
    z(this.P, 'sendRequest_ call when we\'re not connected not allowed.');
    this.ia.ld(a);
    c && (this.Hb[d] = c);
  };
  function $c(a, b, c, d, e) {
    a.e('Listen on ' + b + ' for ' + c);
    var f = { p: b }, d = jb(d, function (a) {
        return Ia(a);
      });
    '{}' !== c && (f.q = d);
    f.h = a.yc(b);
    a.Da('l', f, function (d) {
      a.e('listen response', d);
      d = d.s;
      'ok' !== d && ad(a, b, c);
      e && e(d);
    });
  }
  s.ib = function (a, b, c) {
    this.Ga = {
      vd: a,
      Zc: o,
      W: b,
      Ob: c
    };
    this.e('Authenticating using credential: ' + this.Ga);
    bd(this);
  };
  s.Lb = function (a) {
    delete this.Ga;
    this.wb(o);
    this.P && this.Da('unauth', {}, function (b) {
      a(b.s);
    });
  };
  function bd(a) {
    var b = a.Ga;
    a.P && b && a.Da('auth', { cred: b.vd }, function (c) {
      var d = c.s, c = c.d || 'error';
      'ok' !== d && a.Ga === b && delete a.Ga;
      a.wb('ok' === d);
      b.Zc ? 'ok' !== d && b.Ob && b.Ob(d, c) : (b.Zc = k, b.W && b.W(d, c));
    });
  }
  function cd(a, b, c, d) {
    b = b.toString();
    ad(a, b, c) && a.P && (a.e('Unlisten on ' + b + ' for ' + c), b = { p: b }, d = jb(d, function (a) {
      return Ia(a);
    }), '{}' !== c && (b.q = d), a.Da('u', b));
  }
  function dd(a, b, c, d) {
    a.P ? ed(a, 'o', b, c, d) : a.xb.push({
      Jc: b,
      action: 'o',
      data: c,
      C: d
    });
  }
  s.Ec = function (a, b) {
    this.P ? ed(this, 'oc', a, l, b) : this.xb.push({
      Jc: a,
      action: 'oc',
      data: l,
      C: b
    });
  };
  function ed(a, b, c, d, e) {
    c = {
      p: c,
      d: d
    };
    a.e('onDisconnect ' + b, c);
    a.Da(b, c, function (a) {
      e && setTimeout(function () {
        e(a.s);
      }, 0);
    });
  }
  s.put = function (a, b, c, d) {
    fd(this, 'p', a, b, c, d);
  };
  function fd(a, b, c, d, e, f) {
    c = {
      p: c,
      d: d
    };
    u(f) && (c.h = f);
    a.U.push({
      action: b,
      hd: c,
      C: e
    });
    a.Ab++;
    b = a.U.length - 1;
    a.P && gd(a, b);
  }
  function gd(a, b) {
    var c = a.U[b].action, d = a.U[b].hd, e = a.U[b].C;
    a.U[b].Jd = a.P;
    a.Da(c, d, function (d) {
      a.e(c + ' response', d);
      delete a.U[b];
      a.Ab--;
      0 === a.Ab && (a.U = []);
      e && e(d.s);
    });
  }
  s.Vb = function (a) {
    if ('r' in a) {
      this.e('from server: ' + y(a));
      var b = a.r, c = this.Hb[b];
      c && (delete this.Hb[b], c(a.b));
    } else
      'error' in a && g('A server-side error has occurred: ' + a.error), 'a' in a && (b = a.a, a = a.b, this.e('handleServerMessage', b, a), 'd' === b ? this.Wb(a.p, a.d) : 'm' === b ? this.Wb(a.p, a.d, k) : 'c' === b ? (b = a.p, a = (a = a.q) ? jb(a, function (a) {
        return Ja(a);
      }).join('$') : '{}', (a = ad(this, b, a)) && a.C && a.C('permission_denied')) : 'ac' === b ? (b = a.s, a = a.d, c = this.Ga, delete this.Ga, c && c.Ob && c.Ob(b, a), this.wb(o)) : 'sd' === b ? this.Lc ? this.Lc(a) : 'msg' in a && 'undefined' !== typeof console && console.log('FIREBASE: ' + a.msg.replace('\n', '\nFIREBASE: ')) : Pb('Unrecognized action received from server: ' + y(b) + '\nAre you using the latest client?'));
  };
  s.yb = function (a) {
    this.e('connection ready');
    this.P = k;
    this.rb = new Date().getTime();
    this.Hc({ serverTimeOffset: a - new Date().getTime() });
    bd(this);
    for (var b in this.fa)
      for (var c in this.fa[b])
        a = this.fa[b][c], $c(this, b, c, a.$a, a.C);
    for (b = 0; b < this.U.length; b++)
      this.U[b] && gd(this, b);
    for (; this.xb.length;)
      b = this.xb.shift(), ed(this, b.action, b.Jc, b.data, b.C);
    this.Ub(k);
  };
  function Yc(a, b) {
    z(!a.ia, 'Scheduling a connect when we\'re already connected/ing?');
    a.Ta && clearTimeout(a.Ta);
    a.Ta = setTimeout(function () {
      a.Ta = l;
      if (a.Na) {
        a.e('Making a connection attempt');
        a.Cc = new Date().getTime();
        a.rb = l;
        var b = w(a.Vb, a), d = w(a.yb, a), e = w(a.dd, a), f = a.id + ':' + Zc++;
        a.ia = new Oc(f, a.K, b, d, e, function (b) {
          P(b + ' (' + a.K.toString() + ')');
          a.Na = o;
        });
      }
    }, b);
  }
  s.Hd = function (a) {
    a && (!this.hb && 300000 === this.pa) && (this.e('Window became visible.  Reducing delay.'), this.pa = 1000, this.ia || Yc(this, 0));
    this.hb = a;
  };
  s.Gd = function (a) {
    a ? (this.e('Browser went online.  Reconnecting.'), this.pa = 1000, this.Na = k, this.ia || Yc(this, 0)) : (this.e('Browser went offline.  Killing connection; don\'t reconnect.'), this.Na = o, this.ia && this.ia.close());
  };
  s.dd = function () {
    this.e('data client disconnected');
    this.P = o;
    this.ia = l;
    for (var a = 0; a < this.U.length; a++) {
      var b = this.U[a];
      b && ('h' in b.hd && b.Jd) && (b.C && b.C('disconnect'), delete this.U[a], this.Ab--);
    }
    0 === this.Ab && (this.U = []);
    if (this.Na)
      this.hb ? this.rb && (30000 < new Date().getTime() - this.rb && (this.pa = 1000), this.rb = l) : (this.e('Window isn\'t visible.  Delaying reconnect.'), this.pa = 300000, this.Cc = new Date().getTime()), a = Math.max(0, this.pa - (new Date().getTime() - this.Cc)), a *= Math.random(), this.e('Trying to reconnect in ' + a + 'ms'), Yc(this, a), this.pa = Math.min(300000, 1.3 * this.pa);
    else
      for (var c in this.Hb)
        delete this.Hb[c];
    this.Ub(o);
  };
  s.Ha = function () {
    this.Na = o;
    this.ia ? this.ia.close() : (this.Ta && (clearTimeout(this.Ta), this.Ta = l), this.P && this.dd());
  };
  s.bb = function () {
    this.Na = k;
    this.pa = 1000;
    this.P || Yc(this, 0);
  };
  function ad(a, b, c) {
    b = new K(b).toString();
    c || (c = '{}');
    var d = a.fa[b][c];
    delete a.fa[b][c];
    return d;
  }
  ;
  function hd() {
    this.o = this.D = l;
  }
  function id(a, b, c) {
    if (b.f())
      a.D = c, a.o = l;
    else if (a.D !== l)
      a.D = a.D.xa(b, c);
    else {
      a.o == l && (a.o = new Cc());
      var d = F(b);
      a.o.contains(d) || a.o.add(d, new hd());
      a = a.o.get(d);
      b = Ka(b);
      id(a, b, c);
    }
  }
  function jd(a, b) {
    if (b.f())
      return a.D = l, a.o = l, k;
    if (a.D !== l) {
      if (a.D.N())
        return o;
      var c = a.D;
      a.D = l;
      c.w(function (b, c) {
        id(a, new K(b), c);
      });
      return jd(a, b);
    }
    return a.o !== l ? (c = F(b), b = Ka(b), a.o.contains(c) && jd(a.o.get(c), b) && a.o.remove(c), a.o.f() ? (a.o = l, k) : o) : k;
  }
  function kd(a, b, c) {
    a.D !== l ? c(b, a.D) : a.w(function (a, e) {
      var f = new K(b.toString() + '/' + a);
      kd(e, f, c);
    });
  }
  hd.prototype.w = function (a) {
    this.o !== l && Dc(this.o, function (b, c) {
      a(b, c);
    });
  };
  function ld() {
    this.qa = Q;
  }
  function U(a, b) {
    return a.qa.Q(b);
  }
  function V(a, b, c) {
    a.qa = a.qa.xa(b, c);
  }
  ld.prototype.toString = function () {
    return this.qa.toString();
  };
  function md() {
    this.ra = new ld();
    this.I = new ld();
    this.la = new ld();
    this.Cb = new Na();
  }
  function nd(a, b) {
    for (var c = U(a.ra, b), d = U(a.I, b), e = L(a.Cb, b), f = o, h = e; h !== l;) {
      if (h.k() !== l) {
        f = k;
        break;
      }
      h = h.parent();
    }
    if (f)
      return o;
    c = od(c, d, e);
    return c !== d ? (V(a.I, b, c), k) : o;
  }
  function od(a, b, c) {
    if (c.f())
      return a;
    if (c.k() !== l)
      return b;
    a = a || Q;
    c.w(function (d) {
      var d = d.name(), e = a.M(d), f = b.M(d), h = L(c, d), e = od(e, f, h);
      a = a.G(d, e);
    });
    return a;
  }
  md.prototype.set = function (a, b) {
    var c = this, d = [];
    ib(b, function (a) {
      var b = a.path, a = a.oa, h = Hb();
      M(L(c.Cb, b), h);
      V(c.I, b, a);
      d.push({
        path: b,
        Od: h
      });
    });
    return d;
  };
  function pd(a, b) {
    ib(b, function (b) {
      var d = b.Od, b = L(a.Cb, b.path), e = b.k();
      z(e !== l, 'pendingPut should not be null.');
      e === d && M(b, l);
    });
  }
  ;
  function qd() {
    this.Ua = [];
  }
  function rd(a, b) {
    if (0 !== b.length)
      for (var c = 0; c < b.length; c++)
        a.Ua.push(b[c]);
  }
  qd.prototype.Fb = function () {
    for (var a = 0; a < this.Ua.length; a++)
      if (this.Ua[a]) {
        var b = this.Ua[a];
        this.Ua[a] = l;
        sd(b);
      }
    this.Ua = [];
  };
  function sd(a) {
    var b = a.W, c = a.md, d = a.Eb;
    $b(function () {
      b(c, d);
    });
  }
  ;
  function W(a, b, c, d) {
    this.type = a;
    this.sa = b;
    this.aa = c;
    this.Eb = d;
  }
  ;
  function td(a) {
    this.J = a;
    this.ma = [];
    this.uc = new qd();
  }
  function ud(a, b, c, d, e) {
    a.ma.push({
      type: b,
      W: c,
      cancel: d,
      T: e
    });
    var d = [], f = vd(a.i);
    a.pb && f.push(new W('value', a.i));
    for (var h = 0; h < f.length; h++)
      if (f[h].type === b) {
        var i = new J(a.J.n, a.J.path);
        f[h].aa && (i = i.F(f[h].aa));
        d.push({
          W: e ? w(c, e) : c,
          md: new T(f[h].sa, i),
          Eb: f[h].Eb
        });
      }
    rd(a.uc, d);
  }
  td.prototype.$b = function (a, b) {
    b = this.ac(a, b);
    b != l && wd(this, b);
  };
  function wd(a, b) {
    for (var c = [], d = 0; d < b.length; d++) {
      var e = b[d], f = e.type, h = new J(a.J.n, a.J.path);
      b[d].aa && (h = h.F(b[d].aa));
      h = new T(b[d].sa, h);
      'value' === e.type && !h.nb() ? f += '(' + h.V() + ')' : 'value' !== e.type && (f += ' ' + h.name());
      N(a.J.n.u.id + ': event:' + a.J.path + ':' + a.J.La() + ':' + f);
      for (f = 0; f < a.ma.length; f++) {
        var i = a.ma[f];
        b[d].type === i.type && c.push({
          W: i.T ? w(i.W, i.T) : i.W,
          md: h,
          Eb: e.Eb
        });
      }
    }
    rd(a.uc, c);
  }
  td.prototype.Fb = function () {
    this.uc.Fb();
  };
  function vd(a) {
    var b = [];
    if (!a.N()) {
      var c = l;
      a.w(function (a, e) {
        b.push(new W('child_added', e, a, c));
        c = a;
      });
    }
    return b;
  }
  function xd(a) {
    a.pb || (a.pb = k, wd(a, [new W('value', a.i)]));
  }
  ;
  function zd(a, b) {
    td.call(this, a);
    this.i = b;
  }
  ka(zd, td);
  zd.prototype.ac = function (a, b) {
    this.i = a;
    this.pb && b != l && b.push(new W('value', this.i));
    return b;
  };
  zd.prototype.lb = function () {
    return {};
  };
  function Ad(a, b) {
    this.Pb = a;
    this.Dc = b;
  }
  function Bd(a, b, c, d, e) {
    var f = a.Q(c), h = b.Q(c), d = new Ad(d, e), e = Cd(d, c, f, h), h = !f.f() && !h.f() && f.j() !== h.j();
    if (e || h) {
      f = c;
      for (c = e; f.parent() !== l;) {
        var i = a.Q(f), e = b.Q(f), m = f.parent();
        if (!d.Pb || L(d.Pb, m).k()) {
          var n = b.Q(m), p = [], f = f.Z < f.m.length ? f.m[f.m.length - 1] : l;
          i.f() ? (i = n.da(f, e), p.push(new W('child_added', e, f, i))) : e.f() ? p.push(new W('child_removed', i, f)) : (i = n.da(f, e), h && p.push(new W('child_moved', e, f, i)), c && p.push(new W('child_changed', e, f, i)));
          d.Dc(m, n, p);
        }
        h && (h = o, c = k);
        f = m;
      }
    }
  }
  function Cd(a, b, c, d) {
    var e, f = [];
    c === d ? e = o : c.N() && d.N() ? e = c.k() !== d.k() : c.N() ? (Dd(a, b, Q, d, f), e = k) : d.N() ? (Dd(a, b, c, Q, f), e = k) : e = Dd(a, b, c, d, f);
    e ? a.Dc(b, d, f) : c.j() !== d.j() && a.Dc(b, d, l);
    return e;
  }
  function Dd(a, b, c, d, e) {
    var f = o, h = !a.Pb || !L(a.Pb, b).f(), i = [], m = [], n = [], p = [], q = {}, t = {}, x, O, I, G;
    x = c.Va();
    I = Wa(x);
    O = d.Va();
    for (G = Wa(O); I !== l || G !== l;) {
      c = I === l ? 1 : G === l ? -1 : I.key === G.key ? 0 : cc({
        name: I.key,
        ha: I.value.j()
      }, {
        name: G.key,
        ha: G.value.j()
      });
      if (0 > c)
        f = ua(q, I.key), u(f) ? (n.push({
          wc: I,
          Qc: i[f]
        }), i[f] = l) : (t[I.key] = m.length, m.push(I)), f = k, I = Wa(x);
      else {
        if (0 < c)
          f = ua(t, G.key), u(f) ? (n.push({
            wc: m[f],
            Qc: G
          }), m[f] = l) : (q[G.key] = i.length, i.push(G)), f = k;
        else {
          c = b.F(G.key);
          if (c = Cd(a, c, I.value, G.value))
            p.push(G), f = k;
          I.value.j() !== G.value.j() && (n.push({
            wc: I,
            Qc: G
          }), f = k);
          I = Wa(x);
        }
        G = Wa(O);
      }
      if (!h && f)
        return k;
    }
    for (h = 0; h < m.length; h++)
      if (q = m[h])
        c = b.F(q.key), Cd(a, c, q.value, Q), e.push(new W('child_removed', q.value, q.key));
    for (h = 0; h < i.length; h++)
      if (q = i[h])
        c = b.F(q.key), m = d.da(q.key, q.value), Cd(a, c, Q, q.value), e.push(new W('child_added', q.value, q.key, m));
    for (h = 0; h < n.length; h++)
      q = n[h].wc, i = n[h].Qc, c = b.F(i.key), m = d.da(i.key, i.value), e.push(new W('child_moved', i.value, i.key, m)), (c = Cd(a, c, q.value, i.value)) && p.push(i);
    for (h = 0; h < p.length; h++)
      a = p[h], m = d.da(a.key, a.value), e.push(new W('child_changed', a.value, a.key, m));
    return f;
  }
  ;
  function Ed() {
    this.S = this.wa = l;
    this.set = {};
  }
  ka(Ed, Cc);
  s = Ed.prototype;
  s.setActive = function (a) {
    this.wa = a;
  };
  function Fd(a) {
    return a.contains('default');
  }
  function Gd(a) {
    return a.wa != l && Fd(a);
  }
  s.defaultView = function () {
    return Fd(this) ? this.get('default') : l;
  };
  s.path = aa('S');
  s.toString = function () {
    return jb(this.keys(), function (a) {
      return 'default' === a ? '{}' : a;
    }).join('$');
  };
  s.$a = function () {
    var a = [];
    Dc(this, function (b, c) {
      a.push(c.J);
    });
    return a;
  };
  function Hd(a, b) {
    td.call(this, a);
    this.i = Q;
    this.ac(b, vd(b));
  }
  ka(Hd, td);
  Hd.prototype.ac = function (a, b) {
    if (b === l)
      return b;
    var c = [], d = this.J;
    u(d.ca) && (u(d.ua) && d.ua != l ? c.push(function (a, b) {
      var c = Rb(b, d.ca);
      return 0 < c || 0 === c && 0 <= Sb(a, d.ua);
    }) : c.push(function (a, b) {
      return 0 <= Rb(b, d.ca);
    }));
    u(d.za) && (u(d.Sa) ? c.push(function (a, b) {
      var c = Rb(b, d.za);
      return 0 > c || 0 === c && 0 >= Sb(a, d.Sa);
    }) : c.push(function (a, b) {
      return 0 >= Rb(b, d.za);
    }));
    var e = l, f = l;
    if (u(this.J.Ba))
      if (u(this.J.ca)) {
        if (e = Id(a, c, this.J.Ba, o)) {
          var h = a.M(e).j();
          c.push(function (a, b) {
            var c = Rb(b, h);
            return 0 > c || 0 === c && 0 >= Sb(a, e);
          });
        }
      } else if (f = Id(a, c, this.J.Ba, k)) {
        var i = a.M(f).j();
        c.push(function (a, b) {
          var c = Rb(b, i);
          return 0 < c || 0 === c && 0 <= Sb(a, f);
        });
      }
    for (var m = [], n = [], p = [], q = [], t = 0; t < b.length; t++) {
      var x = b[t].aa, O = b[t].sa;
      switch (b[t].type) {
      case 'child_added':
        Jd(c, x, O) && (this.i = this.i.G(x, O), n.push(b[t]));
        break;
      case 'child_removed':
        this.i.M(x).f() || (this.i = this.i.G(x, l), m.push(b[t]));
        break;
      case 'child_changed':
        !this.i.M(x).f() && Jd(c, x, O) && (this.i = this.i.G(x, O), q.push(b[t]));
        break;
      case 'child_moved':
        var I = !this.i.M(x).f(), G = Jd(c, x, O);
        I ? G ? (this.i = this.i.G(x, O), p.push(b[t])) : (m.push(new W('child_removed', this.i.M(x), x)), this.i = this.i.G(x, l)) : G && (this.i = this.i.G(x, O), n.push(b[t]));
      }
    }
    var Uc = e || f;
    if (Uc) {
      var yd = (t = f !== l) ? this.i.$c() : this.i.ad(), lc = o, $a = o, ab = this;
      (t ? a.vc : a.w).call(a, function (a, b) {
        !$a && yd === l && ($a = k);
        if ($a && lc)
          return k;
        lc ? (m.push(new W('child_removed', ab.i.M(a), a)), ab.i = ab.i.G(a, l)) : $a && (n.push(new W('child_added', b, a)), ab.i = ab.i.G(a, b));
        yd === a && ($a = k);
        a === Uc && (lc = k);
      });
    }
    for (t = 0; t < n.length; t++)
      c = n[t], x = this.i.da(c.aa, c.sa), m.push(new W('child_added', c.sa, c.aa, x));
    for (t = 0; t < p.length; t++)
      c = p[t], x = this.i.da(c.aa, c.sa), m.push(new W('child_moved', c.sa, c.aa, x));
    for (t = 0; t < q.length; t++)
      c = q[t], x = this.i.da(c.aa, c.sa), m.push(new W('child_changed', c.sa, c.aa, x));
    this.pb && 0 < m.length && m.push(new W('value', this.i));
    return m;
  };
  function Id(a, b, c, d) {
    if (a.N())
      return l;
    var e = l;
    (d ? a.vc : a.w).call(a, function (a, d) {
      if (Jd(b, a, d) && (e = a, c--, 0 === c))
        return k;
    });
    return e;
  }
  function Jd(a, b, c) {
    for (var d = 0; d < a.length; d++)
      if (!a[d](b, c.j()))
        return o;
    return k;
  }
  Hd.prototype.zc = function (a) {
    return this.i.M(a) !== Q;
  };
  Hd.prototype.lb = function (a, b, c) {
    var d = {};
    this.i.N() || this.i.w(function (a) {
      d[a] = 3;
    });
    var e = this.i, c = U(c, new K('')), f = new Na();
    M(L(f, this.J.path), k);
    var b = Q.xa(a, b), h = this;
    Bd(c, b, a, f, function (a, b, c) {
      c !== l && a.toString() === h.J.path.toString() && h.ac(b, c);
    });
    this.i.N() ? Xb(d, function (a, b) {
      d[b] = 2;
    }) : (this.i.w(function (a) {
      D(d, a) || (d[a] = 1);
    }), Xb(d, function (a, b) {
      h.i.M(b).f() && (d[b] = 2);
    }));
    this.i = e;
    return d;
  };
  function Kd(a, b) {
    this.u = a;
    this.g = b;
    this.Tb = b.qa;
    this.ka = new Na();
  }
  Kd.prototype.Nb = function (a, b, c, d, e) {
    var f = a.path, h = L(this.ka, f), i = h.k();
    i === l ? (i = new Ed(), M(h, i)) : z(!i.f(), 'We shouldn\'t be storing empty QueryMaps');
    var m = a.La();
    if (i.contains(m))
      a = i.get(m), ud(a, b, c, d, e);
    else {
      var n = this.g.qa.Q(f), n = a = 'default' === a.La() ? new zd(a, n) : new Hd(a, n);
      if (Gd(i) || Ld(h))
        i.add(m, n), i.S || (i.S = n.J.path);
      else {
        var p, q;
        i.f() || (p = i.toString(), q = i.$a());
        i.add(m, n);
        i.S || (i.S = n.J.path);
        i.setActive(Md(this, i));
        p && q && cd(this.u, i.path(), p, q);
      }
      Gd(i) && Pa(h, function (a) {
        if (a = a.k()) {
          a.wa && a.wa();
          a.wa = l;
        }
      });
      ud(a, b, c, d, e);
      (b = (b = Qa(L(this.ka, f), function (a) {
        var b;
        if (b = a.k())
          if (b = a.k().defaultView())
            b = a.k().defaultView().pb;
        if (b)
          return k;
      }, k)) || this.u === l && !U(this.g, f).f()) && xd(a);
    }
    a.Fb();
  };
  function Nd(a, b, c, d, e) {
    var f = a.get(b), h;
    if (h = f) {
      h = o;
      for (var i = f.ma.length - 1; 0 <= i; i--) {
        var m = f.ma[i];
        if ((!c || m.type === c) && (!d || m.W === d) && (!e || m.T === e))
          if (f.ma.splice(i, 1), h = k, c && d)
            break;
      }
      h = h && !(0 < f.ma.length);
    }
    (c = h) && a.remove(b);
    return c;
  }
  Kd.prototype.cc = function (a, b, c, d) {
    var e = L(this.ka, a.path).k();
    return e === l ? l : Od(this, e, a, b, c, d);
  };
  function Od(a, b, c, d, e, f) {
    var h = b.path(), h = L(a.ka, h), c = c ? c.La() : l, i = [];
    c && 'default' !== c ? Nd(b, c, d, e, f) && i.push(c) : ib(b.keys(), function (a) {
      Nd(b, a, d, e, f) && i.push(a);
    });
    b.f() && M(h, l);
    c = Ld(h);
    if (0 < i.length && !c) {
      for (var m = h, n = h.parent(), c = o; !c && n;) {
        var p = n.k();
        if (p) {
          z(!Gd(p));
          var q = m.name(), t = o;
          Dc(p, function (a, b) {
            t = b.zc(q) || t;
          });
          t && (c = k);
        }
        m = n;
        n = n.parent();
      }
      m = l;
      if (!Gd(b)) {
        n = b.wa;
        b.wa = l;
        var x = [], O = function (b) {
            var c = b.k();
            if (c && Fd(c))
              x.push(c.path()), c.wa == l && c.setActive(Md(a, c));
            else {
              if (c) {
                c.wa != l || c.setActive(Md(a, c));
                var d = {};
                Dc(c, function (a, b) {
                  b.i.w(function (a) {
                    D(d, a) || (d[a] = k, a = c.path().F(a), x.push(a));
                  });
                });
              }
              b.w(O);
            }
          };
        O(h);
        m = x;
        n && n();
      }
      return c ? l : m;
    }
    return l;
  }
  function Pd(a, b, c) {
    Pa(L(a.ka, b), function (a) {
      (a = a.k()) && Dc(a, function (a, b) {
        xd(b);
      });
    }, c, k);
  }
  function Qd(a, b, c) {
    function d(a) {
      do {
        if (h[a.toString()])
          return k;
        a = a.parent();
      } while (a !== l);
      return o;
    }
    var e = a.Tb, f = a.g.qa;
    a.Tb = f;
    for (var h = {}, i = 0; i < c.length; i++)
      h[c[i].toString()] = k;
    Bd(e, f, b, a.ka, function (c, e, f) {
      if (b.contains(c)) {
        var h = d(c);
        h && Pd(a, c, o);
        a.$b(c, e, f);
        h && Pd(a, c, k);
      } else
        a.$b(c, e, f);
    });
    d(b) && Pd(a, b, k);
    Rd(a, b);
  }
  function Rd(a, b) {
    var c = L(a.ka, b);
    Pa(c, function (a) {
      (a = a.k()) && Dc(a, function (a, b) {
        b.Fb();
      });
    }, k, k);
    Qa(c, function (a) {
      (a = a.k()) && Dc(a, function (a, b) {
        b.Fb();
      });
    }, o);
  }
  Kd.prototype.$b = function (a, b, c) {
    a = L(this.ka, a).k();
    a !== l && Dc(a, function (a, e) {
      e.$b(b, c);
    });
  };
  function Ld(a) {
    return Qa(a, function (a) {
      return a.k() && Gd(a.k());
    });
  }
  function Md(a, b) {
    if (a.u) {
      var c = a.u, d = b.path(), e = b.toString(), f = b.$a(), h, i = b.keys(), m = Fd(b), n = a.u, p = function (c) {
          if ('ok' !== c) {
            var d = 'Unknown Error';
            'too_big' === c ? d = 'The data requested exceeds the maximum size that can be accessed with a single request.' : 'permission_denied' == c ? d = 'Client doesn\'t have permission to access the desired data.' : 'unavailable' == c && (d = 'The service is unavailable');
            var e = Error(c + ': ' + d);
            e.code = c.toUpperCase();
            P('on() or once() for ' + b.path().toString() + ' failed: ' + e.toString());
            b && (Dc(b, function (a, b) {
              for (var c = 0; c < b.ma.length; c++) {
                var d = b.ma[c];
                d.cancel && (d.T ? w(d.cancel, d.T) : d.cancel)(e);
              }
            }), Od(a, b));
          } else
            h || (m ? Pd(a, b.path(), k) : ib(i, function (a) {
              (a = b.get(a)) && xd(a);
            }), Rd(a, b.path()));
        }, q = b.toString(), t = b.path().toString();
      n.fa[t] = n.fa[t] || {};
      z(!n.fa[t][q], 'listen() called twice for same path/queryId.');
      n.fa[t][q] = {
        $a: b.$a(),
        C: p
      };
      n.P && $c(n, t, q, b.$a(), p);
      return function () {
        h = k;
        cd(c, d, e, f);
      };
    }
    return ca;
  }
  Kd.prototype.lb = function (a, b, c, d) {
    var e = {};
    Dc(b, function (b, h) {
      var i = h.lb(a, c, d);
      Xb(i, function (a, b) {
        e[b] = 3 === a ? 3 : (ua(e, b) || a) === a ? a : 3;
      });
    });
    c.N() || c.w(function (a) {
      D(e, a) || (e[a] = 4);
    });
    return e;
  };
  function Sd(a, b, c, d, e) {
    var f = b.path(), b = a.lb(f, b, d, e), h = Q, i = [];
    Xb(b, function (b, n) {
      var p = new K(n);
      3 === b || 1 === b ? h = h.G(n, d.Q(p)) : (2 === b && i.push({
        path: f.F(n),
        oa: Q
      }), i = i.concat(Td(a, d.Q(p), L(c, p), e)));
    });
    return [{
        path: f,
        oa: h
      }].concat(i);
  }
  function Ud(a, b, c, d) {
    var e;
    a: {
      var f = L(a.ka, b);
      e = f.parent();
      for (var h = []; e !== l;) {
        var i = e.k();
        if (i !== l) {
          if (Fd(i)) {
            e = [{
                path: b,
                oa: c
              }];
            break a;
          }
          i = a.lb(b, i, c, d);
          f = ua(i, f.name());
          if (3 === f || 1 === f) {
            e = [{
                path: b,
                oa: c
              }];
            break a;
          }
          2 === f && h.push({
            path: b,
            oa: Q
          });
        }
        f = e;
        e = e.parent();
      }
      e = h;
    }
    if (1 == e.length && (!e[0].oa.f() || c.f()))
      return e;
    h = L(a.ka, b);
    f = h.k();
    f !== l ? Fd(f) ? e.push({
      path: b,
      oa: c
    }) : e = e.concat(Sd(a, f, h, c, d)) : e = e.concat(Td(a, c, h, d));
    return e;
  }
  function Td(a, b, c, d) {
    var e = c.k();
    if (e !== l)
      return Fd(e) ? [{
          path: c.path(),
          oa: b
        }] : Sd(a, e, c, b, d);
    var f = [];
    c.w(function (c) {
      var e = b.N() ? Q : b.M(c.name()), c = Td(a, e, c, d);
      f = f.concat(c);
    });
    return f;
  }
  ;
  function Vd(a, b) {
    if (!a || 'object' !== typeof a)
      return a;
    z('.sv' in a, 'Unexpected leaf node or priority contents');
    return b[a['.sv']];
  }
  function Wd(a, b) {
    var c = Vd(a.j(), b), d;
    if (a.N()) {
      var e = Vd(a.k(), b);
      return e !== a.k() || c !== a.j() ? new ac(e, c) : a;
    }
    d = a;
    c !== a.j() && (d = d.Ea(c));
    a.w(function (a, c) {
      var e = Wd(c, b);
      e !== c && (d = d.G(a, e));
    });
    return d;
  }
  ;
  function Xd(a) {
    this.K = a;
    this.$ = wc(a);
    this.u = new Wc(this.K, w(this.Wb, this), w(this.Ub, this), w(this.wb, this), w(this.Hc, this), w(this.yc, this));
    var b = w(function () {
        return new tc(this.$, this.u);
      }, this), a = a.toString();
    vc[a] || (vc[a] = b());
    this.nd = vc[a];
    this.fb = new Na();
    this.gb = new ld();
    this.g = new md();
    this.H = new Kd(this.u, this.g.la);
    this.Ac = new ld();
    this.Bc = new Kd(l, this.Ac);
    Yd(this, 'connected', o);
    Yd(this, 'authenticated', o);
    this.R = new hd();
    this.tc = 0;
  }
  s = Xd.prototype;
  s.toString = function () {
    return (this.K.ec ? 'https://' : 'http://') + this.K.host;
  };
  s.name = function () {
    return this.K.ub;
  };
  function Zd(a) {
    a = U(a.Ac, new K('.info/serverTimeOffset')).V() || 0;
    return new Date().getTime() + a;
  }
  function $d(a) {
    a = a = { timestamp: Zd(a) };
    a.timestamp = a.timestamp || new Date().getTime();
    return a;
  }
  s.Wb = function (a, b, c) {
    this.tc++;
    var d, e, f = [];
    9 <= a.length && a.lastIndexOf('.priority') === a.length - 9 ? (d = new K(a.substring(0, a.length - 9)), e = U(this.g.ra, d).Ea(b), f.push(d)) : c ? (d = new K(a), e = U(this.g.ra, d), Xb(b, function (a, b) {
      var c = new K(b);
      e = e.xa(c, S(a));
      f.push(d.F(b));
    })) : (d = new K(a), e = S(b), f.push(d));
    a = Ud(this.H, d, e, this.g.I);
    b = o;
    for (c = 0; c < a.length; ++c) {
      var h = a[c], i = this.g, m = h.path;
      V(i.ra, m, h.oa);
      b = nd(i, m) || b;
    }
    b && (d = ae(this, d));
    Qd(this.H, d, f);
  };
  s.Ub = function (a) {
    Yd(this, 'connected', a);
    if (a === o) {
      this.e('onDisconnectEvents');
      var b = this, c = [], d = $d(this), a = kd, e = new hd();
      kd(this.R, new K(''), function (a, b) {
        id(e, a, Wd(b, d));
      });
      a(e, new K(''), function (a, d) {
        var e = Ud(b.H, a, d, b.g.I);
        c.push.apply(c, b.g.set(a, e));
        e = be(b, a);
        ae(b, e);
        Qd(b.H, e, [a]);
      });
      pd(this.g, c);
      this.R = new hd();
    }
  };
  s.Hc = function (a) {
    var b = this;
    Wb(a, function (a, d) {
      Yd(b, d, a);
    });
  };
  s.yc = function (a) {
    a = new K(a);
    return U(this.g.ra, a).hash();
  };
  s.wb = function (a) {
    Yd(this, 'authenticated', a);
  };
  function Yd(a, b, c) {
    b = new K('/.info/' + b);
    V(a.Ac, b, S(c));
    Qd(a.Bc, b, [b]);
  }
  s.ib = function (a, b, c) {
    'firebaseio-demo.com' === this.K.domain && P('FirebaseRef.auth() not supported on demo (*.firebaseio-demo.com) Firebases. Please use on production (*.firebaseio.com) Firebases only.');
    this.u.ib(a, function (a, c) {
      X(b, a, c);
    }, function (a, b) {
      P('auth() was canceled: ' + b);
      if (c) {
        var f = Error(b);
        f.code = a.toUpperCase();
        c(f);
      }
    });
  };
  s.Lb = function (a) {
    this.u.Lb(function (b) {
      X(a, b);
    });
  };
  s.eb = function (a, b, c, d) {
    this.e('set', {
      path: a.toString(),
      value: b,
      ha: c
    });
    var e = $d(this), b = S(b, c), e = Wd(b, e), e = Ud(this.H, a, e, this.g.I), f = this.g.set(a, e), h = this;
    this.u.put(a.toString(), b.V(k), function (b) {
      'ok' !== b && P('set at ' + a + ' failed: ' + b);
      pd(h.g, f);
      nd(h.g, a);
      var c = ae(h, a);
      Qd(h.H, c, []);
      X(d, b);
    });
    e = be(this, a);
    ae(this, e);
    Qd(this.H, e, [a]);
  };
  s.update = function (a, b, c) {
    this.e('update', {
      path: a.toString(),
      value: b
    });
    var d = U(this.g.la, a), e = k, f = [], h = $d(this), i = [], m;
    for (m in b) {
      var e = o, n = S(b[m]), n = Wd(n, h), d = d.G(m, n), p = a.F(m);
      f.push(p);
      n = Ud(this.H, p, n, this.g.I);
      i = i.concat(this.g.set(a, n));
    }
    if (e)
      N('update() called with empty data.  Don\'t do anything.'), X(c, 'ok');
    else {
      var q = this;
      fd(this.u, 'm', a.toString(), b, function (b) {
        z('ok' === b || 'permission_denied' === b, 'merge at ' + a + ' failed.');
        'ok' !== b && P('update at ' + a + ' failed: ' + b);
        pd(q.g, i);
        nd(q.g, a);
        var d = ae(q, a);
        Qd(q.H, d, []);
        X(c, b);
      }, j);
      b = be(this, a);
      ae(this, b);
      Qd(q.H, b, f);
    }
  };
  s.Mc = function (a, b, c) {
    this.e('setPriority', {
      path: a.toString(),
      ha: b
    });
    var d = $d(this), d = Vd(b, d), d = U(this.g.I, a).Ea(d), d = Ud(this.H, a, d, this.g.I), e = this.g.set(a, d), f = this;
    this.u.put(a.toString() + '/.priority', b, function (a) {
      pd(f.g, e);
      X(c, a);
    });
    a = ae(this, a);
    Qd(f.H, a, []);
  };
  s.Ec = function (a, b) {
    var c = this;
    this.u.Ec(a.toString(), function (d) {
      'ok' === d && jd(c.R, a);
      X(b, d);
    });
  };
  function ce(a, b, c, d) {
    var e = S(c);
    dd(a.u, b.toString(), e.V(k), function (c) {
      'ok' === c && id(a.R, b, e);
      X(d, c);
    });
  }
  function de(a) {
    rc(a.$, 'deprecated_on_disconnect');
    a.nd.Pc.deprecated_on_disconnect = k;
  }
  s.Nb = function (a, b, c, d, e) {
    '.info' === F(a.path) ? this.Bc.Nb(a, b, c, d, e) : this.H.Nb(a, b, c, d, e);
  };
  s.cc = function (a, b, c, d) {
    if ('.info' === F(a.path))
      this.Bc.cc(a, b, c, d);
    else {
      b = this.H.cc(a, b, c, d);
      if (c = b !== l) {
        for (var c = this.g, d = a.path, e = [], f = 0; f < b.length; ++f)
          e[f] = U(c.ra, b[f]);
        V(c.ra, d, Q);
        for (f = 0; f < b.length; ++f)
          V(c.ra, b[f], e[f]);
        c = nd(c, d);
      }
      c && (z(this.g.la.qa === this.H.Tb, 'We should have raised any outstanding events by now.  Else, we\'ll blow them away.'), V(this.g.la, a.path, U(this.g.I, a.path)), this.H.Tb = this.g.la.qa);
    }
  };
  s.Ha = function () {
    this.u.Ha();
  };
  s.bb = function () {
    this.u.bb();
  };
  s.Nc = function (a) {
    if ('undefined' !== typeof console) {
      a ? (this.hc || (this.hc = new sc(this.$)), a = this.hc.get()) : a = this.$.get();
      var b = a, c = [], d = 0, e;
      for (e in b)
        c[d++] = e;
      var f = function (a, b) {
        return Math.max(b.length, a);
      };
      if (c.reduce)
        e = c.reduce(f, 0);
      else {
        var h = 0;
        ib(c, function (a) {
          h = f.call(j, h, a);
        });
        e = h;
      }
      for (var i in a) {
        b = a[i];
        for (c = i.length; c < e + 2; c++)
          i += ' ';
        console.log(i + b);
      }
    }
  };
  s.Oc = function (a) {
    rc(this.$, a);
    this.nd.Pc[a] = k;
  };
  s.e = function () {
    N('r:' + this.u.id + ':', arguments);
  };
  function X(a, b, c) {
    a && $b(function () {
      if ('ok' == b)
        a(l, c);
      else {
        var d = (b || 'error').toUpperCase(), e = d;
        c && (e += ': ' + c);
        e = Error(e);
        e.code = d;
        a(e);
      }
    });
  }
  ;
  function ee(a, b) {
    var c = b || a.fb;
    b || fe(a, c);
    if (c.k() !== l) {
      var d = ge(a, c);
      z(0 < d.length);
      if (2 !== d[0].status && 4 !== d[0].status) {
        for (var e = c.path(), f = 0; f < d.length; f++)
          z(1 === d[f].status, 'tryToSendTransactionQueue_: items in queue should all be run.'), d[f].status = 2, d[f].kd++;
        c = U(a.g.I, e).hash();
        V(a.g.I, e, U(a.g.la, e));
        for (var h = U(a.gb, e).V(k), i = Hb(), m = {}, n = 0; n < d.length; n++)
          d[n].nc && (m[d[n].path.toString()] = d[n].path);
        var p = [], q;
        for (q in m)
          p.push(m[q]);
        for (f = 0; f < p.length; f++)
          M(L(a.g.Cb, p[f]), i);
        a.u.put(e.toString(), h, function (b) {
          a.e('transaction put response', {
            path: e.toString(),
            status: b
          });
          for (f = 0; f < p.length; f++) {
            var c = L(a.g.Cb, p[f]), h = c.k();
            z(h !== l, 'sendTransactionQueue_: pendingPut should not be null.');
            h === i && (M(c, l), V(a.g.I, p[f], U(a.g.ra, p[f])));
          }
          if ('ok' === b) {
            b = [];
            for (f = 0; f < d.length; f++)
              d[f].status = 3, d[f].C && (c = he(a, d[f].path), b.push(w(d[f].C, l, l, k, c))), d[f].kc();
            fe(a, L(a.fb, e));
            ee(a);
            for (f = 0; f < b.length; f++)
              $b(b[f]);
          } else {
            if ('datastale' === b)
              for (f = 0; f < d.length; f++)
                d[f].status = 4 === d[f].status ? 5 : 1;
            else {
              P('transaction at ' + e + ' failed: ' + b);
              for (f = 0; f < d.length; f++)
                d[f].status = 5, d[f].lc = b;
            }
            b = ae(a, e);
            Qd(a.H, b, [e]);
          }
        }, c);
      }
    } else
      c.nb() && c.w(function (b) {
        ee(a, b);
      });
  }
  function ae(a, b) {
    var c = ie(a, b), d = c.path(), e = ge(a, c);
    V(a.g.la, d, U(a.g.I, d));
    V(a.gb, d, U(a.g.I, d));
    if (0 !== e.length) {
      for (var f = c = U(a.g.la, d), h = [], i = 0; i < e.length; i++) {
        var m = La(d, e[i].path), n = o, p;
        z(m !== l, 'rerunTransactionsUnderNode_: relativePath should not be null.');
        if (5 === e[i].status)
          n = k, p = e[i].lc;
        else if (1 === e[i].status)
          if (25 <= e[i].kd)
            n = k, p = 'maxretry';
          else {
            var q = e[i].update(c.Q(m).V());
            u(q) ? (za('transaction failed: Data returned ', q), q = S(q), c = c.xa(m, q), e[i].nc && (f = f.xa(m, q))) : (n = k, p = 'nodata');
          }
        n && (e[i].status = 3, setTimeout(e[i].kc, 0), e[i].C && (n = new J(a, e[i].path), m = new T(c.Q(m), n), 'nodata' === p ? h.push(w(e[i].C, l, l, o, m)) : h.push(w(e[i].C, l, Error(p), o, m))));
      }
      p = U(a.g.I, d).j();
      c = c.Ea(p);
      f = f.Ea(p);
      V(a.gb, d, c);
      V(a.g.la, d, f);
      fe(a, a.fb);
      for (i = 0; i < h.length; i++)
        $b(h[i]);
      ee(a);
    }
    return d;
  }
  function ie(a, b) {
    for (var c, d = a.fb; (c = F(b)) !== l && d.k() === l;)
      d = L(d, c), b = Ka(b);
    return d;
  }
  function ge(a, b) {
    var c = [];
    je(a, b, c);
    c.sort(function (a, b) {
      return a.ed - b.ed;
    });
    return c;
  }
  function je(a, b, c) {
    var d = b.k();
    if (d !== l)
      for (var e = 0; e < d.length; e++)
        c.push(d[e]);
    b.w(function (b) {
      je(a, b, c);
    });
  }
  function fe(a, b) {
    var c = b.k();
    if (c) {
      for (var d = 0, e = 0; e < c.length; e++)
        3 !== c[e].status && (c[d] = c[e], d++);
      c.length = d;
      M(b, 0 < c.length ? c : l);
    }
    b.w(function (b) {
      fe(a, b);
    });
  }
  function be(a, b) {
    var c = ie(a, b).path(), d = L(a.fb, b);
    Qa(d, function (a) {
      ke(a);
    });
    ke(d);
    Pa(d, function (a) {
      ke(a);
    });
    return c;
  }
  function ke(a) {
    var b = a.k();
    if (b !== l) {
      for (var c = [], d = -1, e = 0; e < b.length; e++)
        4 !== b[e].status && (2 === b[e].status ? (z(d === e - 1, 'All SENT items should be at beginning of queue.'), d = e, b[e].status = 4, b[e].lc = 'set') : (z(1 === b[e].status), b[e].kc(), b[e].C && c.push(w(b[e].C, l, Error('set'), o, l))));
      -1 === d ? M(a, l) : b.length = d + 1;
      for (e = 0; e < c.length; e++)
        $b(c[e]);
    }
  }
  function he(a, b) {
    var c = new J(a, b);
    return new T(U(a.gb, b), c);
  }
  ;
  function Y() {
    this.ab = {};
  }
  da(Y);
  Y.prototype.Ha = function () {
    for (var a in this.ab)
      this.ab[a].Ha();
  };
  Y.prototype.interrupt = Y.prototype.Ha;
  Y.prototype.bb = function () {
    for (var a in this.ab)
      this.ab[a].bb();
  };
  Y.prototype.resume = Y.prototype.bb;
  var Z = {
      Ad: function (a) {
        var b = R.prototype.hash;
        R.prototype.hash = a;
        var c = ac.prototype.hash;
        ac.prototype.hash = a;
        return function () {
          R.prototype.hash = b;
          ac.prototype.hash = c;
        };
      }
    };
  Z.hijackHash = Z.Ad;
  Z.La = function (a) {
    return a.La();
  };
  Z.queryIdentifier = Z.La;
  Z.Cd = function (a) {
    return a.n.u.fa;
  };
  Z.listens = Z.Cd;
  Z.Kd = function (a) {
    return a.n.u.ia;
  };
  Z.refConnection = Z.Kd;
  Z.pd = Wc;
  Z.DataConnection = Z.pd;
  Wc.prototype.sendRequest = Wc.prototype.Da;
  Wc.prototype.interrupt = Wc.prototype.Ha;
  Z.qd = Oc;
  Z.RealTimeConnection = Z.qd;
  Oc.prototype.sendRequest = Oc.prototype.ld;
  Oc.prototype.close = Oc.prototype.close;
  Z.od = qb;
  Z.ConnectionTarget = Z.od;
  Z.yd = function () {
    Hc = zc = k;
  };
  Z.forceLongPolling = Z.yd;
  Z.zd = function () {
    Ic = k;
  };
  Z.forceWebSockets = Z.zd;
  Z.Qd = function (a, b) {
    a.n.u.Lc = b;
  };
  Z.setSecurityDebugCallback = Z.Qd;
  Z.Nc = function (a, b) {
    a.n.Nc(b);
  };
  Z.stats = Z.Nc;
  Z.Oc = function (a, b) {
    a.n.Oc(b);
  };
  Z.statsIncrementCounter = Z.Oc;
  Z.tc = function (a) {
    return a.n.tc;
  };
  function $(a, b, c) {
    this.Gb = a;
    this.S = b;
    this.Ca = c;
  }
  $.prototype.cancel = function (a) {
    A('Firebase.onDisconnect().cancel', 0, 1, arguments.length);
    C('Firebase.onDisconnect().cancel', 1, a, k);
    this.Gb.Ec(this.S, a);
  };
  $.prototype.cancel = $.prototype.cancel;
  $.prototype.remove = function (a) {
    A('Firebase.onDisconnect().remove', 0, 1, arguments.length);
    E('Firebase.onDisconnect().remove', this.S);
    C('Firebase.onDisconnect().remove', 1, a, k);
    ce(this.Gb, this.S, l, a);
  };
  $.prototype.remove = $.prototype.remove;
  $.prototype.set = function (a, b) {
    A('Firebase.onDisconnect().set', 1, 2, arguments.length);
    E('Firebase.onDisconnect().set', this.S);
    ya('Firebase.onDisconnect().set', a, o);
    C('Firebase.onDisconnect().set', 2, b, k);
    ce(this.Gb, this.S, a, b);
  };
  $.prototype.set = $.prototype.set;
  $.prototype.eb = function (a, b, c) {
    A('Firebase.onDisconnect().setWithPriority', 2, 3, arguments.length);
    E('Firebase.onDisconnect().setWithPriority', this.S);
    ya('Firebase.onDisconnect().setWithPriority', a, o);
    Da('Firebase.onDisconnect().setWithPriority', 2, b, o);
    C('Firebase.onDisconnect().setWithPriority', 3, c, k);
    ('.length' === this.Ca || '.keys' === this.Ca) && g('Firebase.onDisconnect().setWithPriority failed: ' + this.Ca + ' is a read-only object.');
    var d = this.Gb, e = this.S, f = S(a, b);
    dd(d.u, e.toString(), f.V(k), function (a) {
      'ok' === a && id(d.R, e, f);
      X(c, a);
    });
  };
  $.prototype.setWithPriority = $.prototype.eb;
  $.prototype.update = function (a, b) {
    A('Firebase.onDisconnect().update', 1, 2, arguments.length);
    E('Firebase.onDisconnect().update', this.S);
    Ca('Firebase.onDisconnect().update', a);
    C('Firebase.onDisconnect().update', 2, b, k);
    var c = this.Gb, d = this.S, e = k, f;
    for (f in a)
      e = o;
    if (e)
      N('onDisconnect().update() called with empty data.  Don\'t do anything.'), X(b, k);
    else {
      e = c.u;
      f = d.toString();
      var h = function (e) {
        if ('ok' === e)
          for (var f in a) {
            var h = S(a[f]);
            id(c.R, d.F(f), h);
          }
        X(b, e);
      };
      e.P ? ed(e, 'om', f, a, h) : e.xb.push({
        Jc: f,
        action: 'om',
        data: a,
        C: h
      });
    }
  };
  $.prototype.update = $.prototype.update;
  var le, me = 0, ne = [];
  le = function (a) {
    var b = a === me;
    me = a;
    for (var c = Array(8), d = 7; 0 <= d; d--)
      c[d] = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'.charAt(a % 64), a = Math.floor(a / 64);
    z(0 === a);
    a = c.join('');
    if (b) {
      for (d = 11; 0 <= d && 63 === ne[d]; d--)
        ne[d] = 0;
      ne[d]++;
    } else
      for (d = 0; 12 > d; d++)
        ne[d] = Math.floor(64 * Math.random());
    for (d = 0; 12 > d; d++)
      a += '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'.charAt(ne[d]);
    z(20 === a.length, 'NextPushId: Length should be 20.');
    return a;
  };
  function J() {
    var a, b, c;
    if (arguments[0] instanceof Xd)
      c = arguments[0], a = arguments[1];
    else {
      A('new Firebase', 1, 2, arguments.length);
      var d = arguments[0];
      b = a = '';
      var e = k, f = '';
      if (v(d)) {
        var h = d.indexOf('//');
        if (0 <= h)
          var i = d.substring(0, h - 1), d = d.substring(h + 2);
        h = d.indexOf('/');
        -1 === h && (h = d.length);
        a = d.substring(0, h);
        var d = d.substring(h + 1), m = a.split('.');
        if (3 == m.length) {
          h = m[2].indexOf(':');
          e = 0 <= h ? 'https' === i : k;
          if ('firebase' === m[1])
            Qb(a + ' is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead');
          else {
            b = m[0];
            f = '';
            d = ('/' + d).split('/');
            for (i = 0; i < d.length; i++)
              if (0 < d[i].length) {
                h = d[i];
                try {
                  h = decodeURIComponent(h.replace(/\+/g, ' '));
                } catch (n) {
                }
                f += '/' + h;
              }
          }
          b = b.toLowerCase();
        } else
          b = l;
      }
      e || 'undefined' !== typeof window && (window.location && window.location.protocol && -1 !== window.location.protocol.indexOf('https:')) && P('Insecure Firebase access from a secure page. Please use https in calls to new Firebase().');
      a = new qb(a, e, b);
      b = new K(f);
      e = b.toString();
      if (!(d = !v(a.host)))
        if (!(d = 0 === a.host.length))
          if (!(d = !xa(a.ub)))
            if (d = 0 !== e.length)
              e && (e = e.replace(/^\/*\.info(\/|$)/, '/')), d = !(v(e) && 0 !== e.length && !wa.test(e));
      d && g(Error(B('new Firebase', 1, o) + 'must be a valid firebase URL and the path can\'t contain ".", "#", "$", "[", or "]".'));
      arguments[1] ? arguments[1] instanceof Y ? c = arguments[1] : g(Error('Expected a valid Firebase.Context for second argument to new Firebase()')) : c = Y.mb();
      e = a.toString();
      d = ua(c.ab, e);
      d || (d = new Xd(a), c.ab[e] = d);
      c = d;
      a = b;
    }
    H.call(this, c, a);
  }
  ka(J, H);
  var oe = J, pe = ['Firebase'], qe = ba;
  !(pe[0] in qe) && qe.execScript && qe.execScript('var ' + pe[0]);
  for (var re; pe.length && (re = pe.shift());)
    !pe.length && u(oe) ? qe[re] = oe : qe = qe[re] ? qe[re] : qe[re] = {};
  J.prototype.name = function () {
    A('Firebase.name', 0, 0, arguments.length);
    return this.path.f() ? l : this.path.Z < this.path.m.length ? this.path.m[this.path.m.length - 1] : l;
  };
  J.prototype.name = J.prototype.name;
  J.prototype.F = function (a) {
    A('Firebase.child', 1, 1, arguments.length);
    if (ga(a))
      a = String(a);
    else if (!(a instanceof K))
      if (F(this.path) === l) {
        var b = a;
        b && (b = b.replace(/^\/*\.info(\/|$)/, '/'));
        Ga('Firebase.child', b);
      } else
        Ga('Firebase.child', a);
    return new J(this.n, this.path.F(a));
  };
  J.prototype.child = J.prototype.F;
  J.prototype.parent = function () {
    A('Firebase.parent', 0, 0, arguments.length);
    var a = this.path.parent();
    return a === l ? l : new J(this.n, a);
  };
  J.prototype.parent = J.prototype.parent;
  J.prototype.root = function () {
    A('Firebase.ref', 0, 0, arguments.length);
    for (var a = this; a.parent() !== l;)
      a = a.parent();
    return a;
  };
  J.prototype.root = J.prototype.root;
  J.prototype.toString = function () {
    A('Firebase.toString', 0, 0, arguments.length);
    var a;
    if (this.parent() === l)
      a = this.n.toString();
    else {
      a = this.parent().toString() + '/';
      var b = this.name();
      a += encodeURIComponent(String(b));
    }
    return a;
  };
  J.prototype.toString = J.prototype.toString;
  J.prototype.set = function (a, b) {
    A('Firebase.set', 1, 2, arguments.length);
    E('Firebase.set', this.path);
    ya('Firebase.set', a, o);
    C('Firebase.set', 2, b, k);
    return this.n.eb(this.path, a, l, b);
  };
  J.prototype.set = J.prototype.set;
  J.prototype.update = function (a, b) {
    A('Firebase.update', 1, 2, arguments.length);
    E('Firebase.update', this.path);
    Ca('Firebase.update', a);
    C('Firebase.update', 2, b, k);
    return this.n.update(this.path, a, b);
  };
  J.prototype.update = J.prototype.update;
  J.prototype.eb = function (a, b, c) {
    A('Firebase.setWithPriority', 2, 3, arguments.length);
    E('Firebase.setWithPriority', this.path);
    ya('Firebase.setWithPriority', a, o);
    Da('Firebase.setWithPriority', 2, b, o);
    C('Firebase.setWithPriority', 3, c, k);
    ('.length' === this.name() || '.keys' === this.name()) && g('Firebase.setWithPriority failed: ' + this.name() + ' is a read-only object.');
    return this.n.eb(this.path, a, b, c);
  };
  J.prototype.setWithPriority = J.prototype.eb;
  J.prototype.remove = function (a) {
    A('Firebase.remove', 0, 1, arguments.length);
    E('Firebase.remove', this.path);
    C('Firebase.remove', 1, a, k);
    this.set(l, a);
  };
  J.prototype.remove = J.prototype.remove;
  J.prototype.transaction = function (a, b, c) {
    function d() {
    }
    A('Firebase.transaction', 1, 3, arguments.length);
    E('Firebase.transaction', this.path);
    C('Firebase.transaction', 1, a, o);
    C('Firebase.transaction', 2, b, k);
    u(c) && 'boolean' != typeof c && g(Error(B('Firebase.transaction', 3, k) + 'must be a boolean.'));
    ('.length' === this.name() || '.keys' === this.name()) && g('Firebase.transaction failed: ' + this.name() + ' is a read-only object.');
    'undefined' === typeof c && (c = k);
    var e = this.n, f = this.path, h = c;
    e.e('transaction on ' + f);
    var i = new J(e, f);
    i.Ya('value', d);
    var h = {
        path: f,
        update: a,
        C: b,
        status: l,
        ed: Hb(),
        nc: h,
        kd: 0,
        kc: function () {
          i.vb('value', d);
        },
        lc: l
      }, m = h.update(U(e.gb, f).V());
    if (u(m)) {
      za('transaction failed: Data returned ', m);
      h.status = 1;
      var n = L(e.fb, f), p = n.k() || [];
      p.push(h);
      M(n, p);
      n = 'object' === typeof m && m !== l && D(m, '.priority') ? m['.priority'] : U(e.g.I, f).j();
      V(e.gb, f, S(m, n));
      h.nc && (V(e.g.la, f, S(m, n)), Qd(e.H, f, [f]));
      ee(e);
    } else
      h.kc(), h.C && (e = he(e, f), h.C(l, o, e));
  };
  J.prototype.transaction = J.prototype.transaction;
  J.prototype.Mc = function (a, b) {
    A('Firebase.setPriority', 1, 2, arguments.length);
    E('Firebase.setPriority', this.path);
    Da('Firebase.setPriority', 1, a, o);
    C('Firebase.setPriority', 2, b, k);
    this.n.Mc(this.path, a, b);
  };
  J.prototype.setPriority = J.prototype.Mc;
  J.prototype.push = function (a, b) {
    A('Firebase.push', 0, 2, arguments.length);
    E('Firebase.push', this.path);
    ya('Firebase.push', a, k);
    C('Firebase.push', 2, b, k);
    var c = Zd(this.n), c = le(c), c = this.F(c);
    'undefined' !== typeof a && a !== l && c.set(a, b);
    return c;
  };
  J.prototype.push = J.prototype.push;
  J.prototype.ga = function () {
    return new $(this.n, this.path, this.name());
  };
  J.prototype.onDisconnect = J.prototype.ga;
  J.prototype.Ld = function () {
    P('FirebaseRef.removeOnDisconnect() being deprecated. Please use FirebaseRef.onDisconnect().remove() instead.');
    this.ga().remove();
    de(this.n);
  };
  J.prototype.removeOnDisconnect = J.prototype.Ld;
  J.prototype.Pd = function (a) {
    P('FirebaseRef.setOnDisconnect(value) being deprecated. Please use FirebaseRef.onDisconnect().set(value) instead.');
    this.ga().set(a);
    de(this.n);
  };
  J.prototype.setOnDisconnect = J.prototype.Pd;
  J.prototype.ib = function (a, b, c) {
    A('Firebase.auth', 1, 3, arguments.length);
    v(a) || g(Error(B('Firebase.auth', 1, o) + 'must be a valid credential (a string).'));
    C('Firebase.auth', 2, b, k);
    C('Firebase.auth', 3, b, k);
    this.n.ib(a, b, c);
  };
  J.prototype.auth = J.prototype.ib;
  J.prototype.Lb = function (a) {
    A('Firebase.unauth', 0, 1, arguments.length);
    C('Firebase.unauth', 1, a, k);
    this.n.Lb(a);
  };
  J.prototype.unauth = J.prototype.Lb;
  J.goOffline = function () {
    A('Firebase.goOffline', 0, 0, arguments.length);
    Y.mb().Ha();
  };
  J.goOnline = function () {
    A('Firebase.goOnline', 0, 0, arguments.length);
    Y.mb().bb();
  };
  function Nb(a, b) {
    z(!b || a === k || a === o, 'Can\'t turn on custom loggers persistently.');
    a === k ? ('undefined' !== typeof console && ('function' === typeof console.log ? Lb = w(console.log, console) : 'object' === typeof console.log && (Lb = function (a) {
      console.log(a);
    })), b && ob.setItem('logging_enabled', 'true')) : a ? Lb = a : (Lb = l, ob.removeItem('logging_enabled'));
  }
  J.enableLogging = Nb;
  J.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  J.INTERNAL = Z;
  J.Context = Y;
}());
'use strict';
var AngularFire;
angular.module('firebase', []).value('Firebase', Firebase), angular.module('firebase').factory('angularFire', [
  '$q',
  '$parse',
  '$timeout',
  function (a, b, c) {
    return function (d, e, f) {
      var g = new AngularFire(a, b, c, d);
      return g.associate(e, f);
    };
  }
]), AngularFire = function (a, b, c, d) {
  if (this._q = a, this._parse = b, this._timeout = c, this._initial = !0, this._remoteValue = !1, 'string' == typeof d)
    throw new Error('Please provide a Firebase reference instead of a URL, eg: new Firebase(url)');
  this._fRef = d;
}, AngularFire.prototype = {
  associate: function (a, b) {
    var c = this, d = this._q.defer(), e = d.promise;
    return this._fRef.on('value', function (e) {
      var f = e.val(), g = angular.fromJson(angular.toJson(c._parse(b)(a)));
      if (c._initial) {
        c._initial = !1;
        var h = !1, i = Object.prototype.toString;
        if (f && i.call(g) == i.call(f))
          if ('[object Array]' == i.call(g))
            h = g.concat(f), angular.equals(h, f) || (c._fRef.ref().set(h), f = h);
          else if ('[object Object]' == i.call(g)) {
            h = g;
            for (var j in f)
              h[j] = f[j];
            c._fRef.ref().update(h), f = h;
          }
        null === f && void 0 !== g && (c._fRef.ref().set(g), f = g);
      }
      var k = !1;
      d && (k = d, d = !1), c._timeout(function () {
        c._resolve(a, b, k, f);
      });
    }), e;
  },
  disassociate: function () {
    var a = this;
    a._unregister && a._unregister(), this._fRef.off('value');
  },
  _resolve: function (a, b, c, d) {
    var e = this;
    if (null === d) {
      var f = a[b];
      if ('object' == typeof f) {
        var g = Object.prototype.toString;
        d = g.call(f) == g.call([]) ? [] : {};
      }
    }
    this._remoteValue = angular.copy(d), this._parse(b).assign(a, angular.copy(d)), c && (c.resolve(function () {
      e.disassociate();
    }), this._watch(a, b));
  },
  _watch: function (a, b) {
    var c = this;
    c._unregister = a.$watch(b, function () {
      if (!c._initial) {
        var d = angular.fromJson(angular.toJson(c._parse(b)(a)));
        if (!angular.equals(d, c._remoteValue)) {
          var e = Object.prototype.toString;
          '[object Object]' == e.call(d) ? c._fRef.set ? c._fRef.set(d) : c._fRef.ref().update(d) : c._fRef.ref().set(d);
        }
      }
    }, !0), a.$on('$destroy', function () {
      c.disassociate();
    });
  },
  _log: function (a) {
    console && console.log && console.log(a);
  }
}, angular.module('firebase').factory('angularFireCollection', [
  '$timeout',
  function (a) {
    return function (b, c) {
      function d(a) {
        return a ? l[a] + 1 : 0;
      }
      function e(a, b) {
        l[b.$id] = a, m.splice(a, 0, b);
      }
      function f(a) {
        var b = l[a];
        m.splice(b, 1), l[a] = void 0;
      }
      function g(a, b) {
        m[a] = b;
      }
      function h(a, b, c) {
        m.splice(a, 1), m.splice(b, 0, c), i(a, b);
      }
      function i(a, b) {
        var c = m.length;
        b = b || c, b > c && (b = c);
        for (var d = a; b > d; d++) {
          var e = m[d];
          e.$index = l[e.$id] = d;
        }
      }
      if ('string' == typeof b)
        throw new Error('Please provide a Firebase reference instead of a URL, eg: new Firebase(url)');
      var j = function (a, b) {
          this.$ref = a.ref(), this.$id = a.name(), this.$index = b, angular.extend(this, { $priority: a.getPriority() }, a.val());
        }, k = [
          function (a) {
            return null == a.$priority ? 0 : angular.isNumber(a.$priority) ? 1 : angular.isString(a.$priority) ? 2 : void 0;
          },
          function (a) {
            return a.$priority ? a.$priority : 1 / 0;
          },
          function (a) {
            return a.$id;
          }
        ], l = {}, m = [];
      return c && 'function' == typeof c && b.once('value', c), b.on('child_added', function (b, c) {
        a(function () {
          var a = d(c);
          e(a, new j(b, a)), i(a);
        });
      }), b.on('child_removed', function (b) {
        a(function () {
          var a = b.name(), c = l[a];
          f(a), i(c);
        });
      }), b.on('child_changed', function (b, c) {
        a(function () {
          var a = l[b.name()], e = d(c), f = new j(b, a);
          g(a, f), e !== a && h(a, e, f);
        });
      }), b.on('child_moved', function (b, c) {
        a(function () {
          var a = l[b.name()], e = d(c), f = m[a];
          h(a, e, f);
        });
      }), m.getByName = function (a) {
        return m[l[a]];
      }, m.getByNames = function (a) {
        for (var b = [], c = 0, d = a.length; d > c; c++)
          b.push(m[l[a[c]]]);
        return b;
      }, m.add = function (a, c) {
        var d, e = angular.fromJson(angular.toJson(a));
        return d = c ? b.ref().push(e, c) : b.ref().push(e);
      }, m.remove = function (a, b) {
        var c = angular.isString(a) ? m[l[a]] : a;
        b ? c.$ref.remove(b) : c.$ref.remove();
      }, m.update = function (a, b) {
        var c = angular.isString(a) ? m[l[a]] : a, d = angular.fromJson(angular.toJson(c));
        b ? c.$ref.update(d, b) : c.$ref.update(d);
      }, m.set = function (a, b) {
        var c = angular.isString(a) ? m[l[a]] : a, d = angular.fromJson(angular.toJson(c));
        b ? c.$ref.set(d, b) : c.$ref.set(d);
      }, m.order = k, m;
    };
  }
]), angular.module('firebase').factory('angularFireAuth', [
  '$rootScope',
  '$parse',
  '$timeout',
  '$location',
  '$route',
  '$q',
  function (a, b, c, d, e, f) {
    function g(a) {
      var b = a.split('.');
      if (!b instanceof Array || 3 !== b.length)
        throw new Error('Invalid JWT');
      var c = b[1];
      return window.atob ? JSON.parse(decodeURIComponent(escape(window.atob(c)))) : a;
    }
    function h(a, d, e, f) {
      d && c(function () {
        b(d).assign(a, e), f();
      });
    }
    function i(a, b, c) {
      a.authRequired && !c._authenticated && (c._redirectTo = void 0 === a.pathTo ? d.path() : a.pathTo === b ? '/' : a.pathTo, d.replace(), d.path(b));
    }
    return {
      initialize: function (b, c) {
        var d = this;
        if ('string' == typeof b)
          throw new Error('Please provide a Firebase reference instead of a URL, eg: new Firebase(url)');
        if (c = c || {}, this._scope = a, !c.scope)
          throw new Error('Scope not provided to angularFireAuth!');
        if (this._scope = c.scope, !c.name)
          throw new Error('Model name not provided to angularFireAuth!');
        if (this._name = c.name, this._cb = function () {
          }, c.callback && 'function' == typeof c.callback && (this._cb = c.callback), this._redirectTo = null, this._authenticated = !1, c.path && (e.current && i(e.current, c.path, d), a.$on('$routeChangeStart', function (a, b) {
            i(b, c.path, d);
          })), this._ref = b, c.simple === !1)
          return h(this._scope, this._name, null, function () {
          }), void 0;
        if (!window.FirebaseSimpleLogin) {
          var f = new Error('FirebaseSimpleLogin undefined, did you include firebase-simple-login.js?');
          return a.$broadcast('angularFireAuth:error', f), void 0;
        }
        var g = new FirebaseSimpleLogin(this._ref, function (b, c) {
            d._cb(b, c), b ? a.$broadcast('angularFireAuth:error', b) : c ? d._loggedIn(c) : d._loggedOut();
          });
        this._authClient = g;
      },
      login: function (b, c) {
        var d = this._watchForLogin();
        switch (b) {
        case 'github':
        case 'persona':
        case 'twitter':
        case 'facebook':
        case 'password':
          if (this._authClient)
            this._authClient.login(b, c);
          else {
            var e = new Error('Simple Login not initialized');
            a.$broadcast('angularFireAuth:error', e);
          }
          break;
        default:
          var f, h = this;
          try {
            f = g(b), this._ref.auth(b, function (b) {
              b ? a.$broadcast('angularFireAuth:error', b) : h._loggedIn(f);
            });
          } catch (i) {
            a.$broadcast('angularFireAuth:error', i);
          }
        }
        return d;
      },
      createUser: function (b, d, e, f) {
        var g = this;
        this._authClient.createUser(b, d, function (h, i) {
          try {
            h ? a.$broadcast('angularFireAuth:error', h) : f || g.login('password', {
              email: b,
              password: d
            });
          } catch (j) {
            a.$broadcast('angularFireAuth:error', j);
          }
          e && c(function () {
            e(h, i);
          });
        });
      },
      logout: function () {
        this._authClient ? this._authClient.logout() : (this._ref.unauth(), this._loggedOut());
      },
      _loggedIn: function (b) {
        var c = this;
        this._authenticated = !0, h(this._scope, this._name, b, function () {
          a.$broadcast('angularFireAuth:login', b), c._redirectTo && (d.replace(), d.path(c._redirectTo), c._redirectTo = null);
        });
      },
      _loggedOut: function () {
        this._authenticated = !1, h(this._scope, this._name, null, function () {
          a.$broadcast('angularFireAuth:logout');
        });
      },
      _watchForLogin: function () {
        function b(a, b) {
          c(function () {
            a ? e.reject(a) : e.resolve(b);
          });
          for (var f = 0; f < d.length; f++)
            d[f]();
        }
        var d = [], e = f.defer();
        return d.push(a.$on('angularFireAuth:login', function (a, c) {
          b(null, c);
        })), d.push(a.$on('angularFireAuth:error', function (a, c) {
          b(c, null);
        })), e.promise;
      }
    };
  }
]);