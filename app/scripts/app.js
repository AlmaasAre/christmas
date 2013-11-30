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
      filepicker.setKey('A24r63xRRxKoCJfFyMrJwz');


    });

angular.module('christmasApp').run(function () {
});