'use strict';

angular.module('christmasApp')
  .controller('MainCtrl', function ($scope, angularFire) {

        $scope.checkDate = function (day) {
            return new Date().getDate <= day;
        }

        $scope.calendar = [];

        angularFire(new Firebase('https://christmas.firebaseio.com/calendar'), $scope, 'calendar').then(


        );

        $scope.flipCalendar = function (i) {

            $scope.calendar[i-1].flipped = !$scope.calendar[i-1].flipped;

        };

        $scope.getClass = function (i) {
            return 'flipped';
        }

  });
