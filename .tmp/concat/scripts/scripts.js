'use strict';
angular.module('christmasApp', [
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ngRoute',
  'firebase',
  'ngAnimate'
]).config([
  '$routeProvider',
  '$provide',
  function ($routeProvider, $provide) {
    $routeProvider.when('/', {
      templateUrl: 'views/main.html',
      controller: 'MainCtrl'
    }).when('/admin', {
      templateUrl: 'views/admin.html',
      controller: 'AdminCtrl'
    }).otherwise({ redirectTo: '/' });
    $provide.value('filepicker', filepicker);
    filepicker.setKey('A24r63xRRxKoCJfFyMrJwz');
  }
]);
angular.module('christmasApp').run(function () {
});
'use strict';
angular.module('christmasApp').controller('LoadCtrl', [
  '$scope',
  '$rootScope',
  function ($scope, $rootScope) {
    $rootScope.$watch('loadsanta', function () {
      $scope.loadsanta = $rootScope.loadsanta;
      console.log('hiioh');
    });
  }
]);
'use strict';
angular.module('christmasApp').controller('MainCtrl', [
  '$scope',
  'angularFire',
  '$rootScope',
  function ($scope, angularFire, $rootScope) {
    $scope.checkDate = function (day) {
      return new Date().getDate <= day;
    };
    $scope.calendar = [];
    $scope.selectedItem = {};
    angularFire(new Firebase('https://christmas.firebaseio.com/fap'), $scope, 'calendar').then(function () {
      $rootScope.loadsanta = true;
    });
    $scope.flipCalendar = function (i, imgUrl) {
      if ($scope.calendar[i - 1].flipped) {
        document.getElementById('punch').click();
        $scope.selectedItem.day = i;
        $scope.selectedItem.imgUrl = null;
        $scope.selectedItem.imgUrl = imgUrl;
        return;
      }
      var date = new Date();
      if (i > date.getDate()) {
        document.getElementById('fail').click();
        return;
      }
      $scope.calendar[i - 1].flipped = !$scope.calendar[i - 1].flipped;
      $scope.selectedItem.day = i;
      $scope.selectedItem.imgUrl = null;
      $scope.selectedItem.imgUrl = imgUrl;
      setTimeout(function () {
        document.getElementById('punch').click();
      }, 1000);
    };
    var ModalEffects = function () {
        function init() {
          var overlay = document.querySelector('.md-overlay');
          [].slice.call(document.querySelectorAll('.md-trigger')).forEach(function (el, i) {
            var modal = document.querySelector('#' + el.getAttribute('data-modal'));
            function removeModal(hasPerspective) {
              classie.remove(modal, 'md-show');
              if (hasPerspective) {
                classie.remove(document.documentElement, 'md-perspective');
              }
            }
            function removeModalHandler() {
              removeModal(classie.has(el, 'md-setperspective'));
            }
            el.addEventListener('click', function (ev) {
              classie.add(modal, 'md-show');
              overlay.removeEventListener('click', removeModalHandler);
              overlay.addEventListener('click', removeModalHandler);
              if (classie.has(el, 'md-setperspective')) {
                setTimeout(function () {
                  classie.add(document.documentElement, 'md-perspective');
                }, 25);
              }
            });
          });
        }
        init();
      }();
  }
]);
'use strict';
angular.module('christmasApp').controller('AdminCtrl', [
  '$rootScope',
  '$scope',
  '$location',
  'Auth',
  'angularFire',
  'Firebase',
  function ($rootScope, $scope, $location, Auth, angularFire, Firebase) {
    $rootScope.loadsanta = true;
    $scope.login = function (username, password) {
      var status = Auth.login(username, password);
      $scope.isLoggedIn = status;
    };
    $scope.isLoggedIn = false;
    $scope.pickFile = function (day, poem) {
      var ref = new Firebase('https://christmas.firebaseio.com/fap/' + (parseInt(day) - 1));
      ref.once('value', function (data) {
        $scope.calendarItem = data.val();
        filepicker.pickAndStore({ mimetype: 'image/*' }, { location: 'S3' }, function (InkBlobs) {
          var item = InkBlobs[0];
          $scope.imageUrl = item.url;
          $scope.calendarItem.imgUrl = $scope.imageUrl;
          $scope.calendarItem.poem = poem;
          ref.set($scope.calendarItem);
        });
      });
    };
  }
]);
'use strict';
angular.module('christmasApp').service('Auth', [
  '$http',
  function Auth($http) {
    var _model = { isLoggedIn: false };
    ;
    var _isLoggedIn = function () {
        return _model.isLoggedIn;
      }, _login = function (username, password) {
        if (username == 'mralmaas@gmail.com' && password == 'eplemoshansen') {
          _model.isLoggedIn = true;
          return true;
        }
        return false;
      }, _logout = function () {
        _model.isLoggedIn = false;
      };
    return {
      isLoggedIn: _isLoggedIn,
      login: _login,
      logout: _logout
    };
  }
]);