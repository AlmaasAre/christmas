'use strict';

angular.module('christmasApp', [
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ngRoute',
  'firebase',
  'ngAnimate'
])
  .config(function ($routeProvider, $provide) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .when('/admin', {
        templateUrl: 'views/admin.html',
        controller: 'AdminCtrl'
      })
      .otherwise({
        redirectTo: '/'
      });

      $provide.value('filepicker', filepicker);
      filepicker.setKey('Super_Awesome_Key');

  });

angular.module('christmasApp').run(function () {
    filepicker.setKey('A24r63xRRxKoCJfFyMrJwz');
});