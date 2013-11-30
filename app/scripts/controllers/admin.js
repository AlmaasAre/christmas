'use strict';

angular.module('christmasApp')
  .controller('AdminCtrl', function ($rootScope, $scope, $location, Auth, angularFire, Firebase) {

        $rootScope.loadsanta = true;

        $scope.login = function (username, password) {
            var status = Auth.login(username, password);
            $scope.isLoggedIn = status;
        }

        $scope.isLoggedIn = false;

        $scope.pickFile = function (day, poem) {

            var ref = new Firebase('https://christmas.firebaseio.com/fap/' + (parseInt(day)-1));
            ref.once('value', function (data) {
                $scope.calendarItem = data.val();

                filepicker.pickAndStore({mimetype:"image/*"},
                    {location:"S3"}, function(InkBlobs){
                        var item = InkBlobs[0];
                        $scope.imageUrl = item.url;
                        $scope.calendarItem.imgUrl = $scope.imageUrl;
                        $scope.calendarItem.poem = poem;

                        ref.set($scope.calendarItem);

                    });

            });
        }
  });
