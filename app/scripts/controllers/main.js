'use strict';

angular.module('christmasApp')
  .controller('MainCtrl', function ($scope, angularFire) {

        $scope.checkDate = function (day) {
            return new Date().getDate <= day;
        }

        $scope.calendar = [];

        angularFire(new Firebase('https://christmas.firebaseio.com/calendar'), $scope, 'calendar');


        $scope.flipCalendar = function (i) {
            alert(i);
        };


  });
