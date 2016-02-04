angular.module('duel.gameCtrl', ['duel.game.playCtrl', 'duel.game.watchCtrl'])

.controller('GameCtrl', ['$scope', '$state', '$stateParams', 'UserFact', '$http', function($scope, $state, $stateParams, UserFact, $http) {
  $scope.gameId = $stateParams.gameId;
  $scope.currentUser = UserFact.getUser().userName;
  $scope.data = {};

  $scope.play = function() {
    $http.post('/api/game/unlock', {
      gameId: $scope.gameId,
      password: $scope.data.password
    }).then(function(response) {
      if (response.status === 200) {
        $state.go('game.play', {
          gameId: $scope.gameId
        });
      }
    })
  }

  $scope.watch = function() {
    $state.go('game.watch', {
      gameId: $scope.gameId
    })
  }
}]);