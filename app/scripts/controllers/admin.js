'use strict';

angular.module('christmasApp')
  .controller('AdminCtrl', function ($scope, $location, Auth) {

        $scope.login = function () {
             Auth.login($scope.username, $scope.password);
        }


        $scope.isLoggedIn = function () {
           return Auth.isLoggedIn();
        };


  });
