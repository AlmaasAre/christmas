'use strict';

angular.module('christmasApp')
  .controller('AdminCtrl', function ($rootScope, $scope, $location, Auth, angularFire) {

        $rootScope.loadsanta = true;

        $scope.login = function () {
            var status = Auth.login($scope.username, $scope.password);
            $scope.isLoggedIn = status;
        }

        $scope.isLoggedIn = false;

        $scope.pickFile = function () {
            filepicker.pickAndStore({mimetype:"image/*"},
                {location:"S3"}, function(InkBlobs){
                    var item = JSON.stringify(InkBlobs)[0];
                    $scope.imageUrl = item.url;

                    angularFire(new Firebase('https://christmas.firebaseio.com/calendar'+ ($scope.day-1)), $scope, 'calendarItem')
                        .then(function () {
                            $scope.calendarItem.imgUrl = $scope.imageUrl;
                            alert('SUCCESS!!');
                        });

                });
        }
  });
