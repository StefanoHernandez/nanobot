# source env.sh — project-local Android toolchain (delete with: rm -rf .toolchain)
_T="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)/.toolchain"
export JAVA_HOME="$_T/jdk/Contents/Home"
export ANDROID_HOME="$_T/android" ANDROID_SDK_ROOT="$_T/android"
export ANDROID_USER_HOME="$_T/android-user" GRADLE_USER_HOME="$_T/gradle" ANDROID_AVD_HOME="$_T/android-user/avd"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
