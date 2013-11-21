'use strict';

angular.module('christmasApp')
  .controller('LoadCtrl', function ($scope, $rootScope) {

        $rootScope.$watch('loadsanta', function () {
            $scope.loadsanta = $rootScope.loadsanta;
            console.log('hiioh')

        });

  });
